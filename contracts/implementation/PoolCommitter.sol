//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IPoolCommitter.sol";
import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPoolFactory.sol";
import "../interfaces/IAutoClaim.sol";
import "../interfaces/IPausable.sol";
import "../interfaces/IInvariantCheck.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./PoolSwapLibrary.sol";

/// @title This contract is responsible for handling commitment logic
contract PoolCommitter is IPoolCommitter, IPausable, Initializable {
    // #### Globals
    uint128 public constant LONG_INDEX = 0;
    uint128 public constant SHORT_INDEX = 1;

    // 15 was chosen because it will definitely fit in a block on Arbitrum which can be tricky to ascertain definitive computation cap without trial and error, while it is also a reasonable number of upkeeps to get executed in one transaction
    uint8 public constant MAX_ITERATIONS = 15;
    IAutoClaim public autoClaim;
    uint128 public override updateIntervalId = 1;
    // The amount that is extracted from each mint and burn, being left in the pool. Given as the decimal * 10 ^ 18. For example, 60% fee is 0.6 * 10 ^ 18
    // Fees can be 0.
    bytes16 public mintingFee;
    bytes16 public burningFee;
    // The amount that the `mintingFee` will change each update interval, based on `updateMintingFee`, given as a decimal * 10 ^ 18 (same format as `_mintingFee`)
    bytes16 public changeInterval;

    // Index 0 is the LONG token, index 1 is the SHORT token.
    // Fetched from the LeveragedPool when leveragedPool is set
    address[2] public tokens;

    mapping(uint256 => Prices) public priceHistory; // updateIntervalId => tokenPrice
    mapping(uint256 => bytes16) public burnFeeHistory; // updateIntervalId => burn fee. We need to store this historically because people can claim at any time after the update interval, but we want them to pay the fee from the update interval in which they committed.
    mapping(address => Balance) public userAggregateBalance;

    // The total amount of settlement that has been committed to mints that are not yet executed
    uint256 public override pendingMintSettlementAmount;
    // The total amount of short pool tokens that have been burnt that are not yet executed on
    uint256 public override pendingShortBurnPoolTokens;
    // The total amount of long pool tokens that have been burnt that are not yet executed on
    uint256 public override pendingLongBurnPoolTokens;
    // Update interval ID => TotalCommitment
    mapping(uint256 => TotalCommitment) public totalPoolCommitments;
    // Address => Update interval ID => UserCommitment
    mapping(address => mapping(uint256 => UserCommitment)) public userCommitments;
    // The last interval ID for which a given user's balance was updated
    mapping(address => uint256) public lastUpdatedIntervalId;
    // An array for all update intervals in which a user committed
    mapping(address => uint256[]) public unAggregatedCommitments;
    // Used to create a dynamic array that is used to copy the new unAggregatedCommitments array into the mapping after updating balance
    uint256[] private storageArrayPlaceHolder;

    address public factory;
    address public governance;
    address public feeController;
    address public leveragedPool;
    address public invariantCheck;
    bool public override paused;

    modifier onlyFeeController() {
        require(msg.sender == feeController, "msg.sender not fee controller");
        _;
    }

    modifier onlyUnpaused() {
        require(!paused, "Pool is paused");
        _;
    }

    modifier onlyGov() {
        require(msg.sender == governance, "msg.sender not governance");
        _;
    }

    /**
     * @notice Asserts that the caller is the associated `PoolFactory` contract
     */
    modifier onlyFactory() {
        require(msg.sender == factory, "Committer: not factory");
        _;
    }

    /**
     * @notice Asserts that the caller is the associated `LeveragedPool` contract
     */
    modifier onlyPool() {
        require(msg.sender == leveragedPool, "msg.sender not leveragedPool");
        _;
    }

    modifier onlyInvariantCheckContract() {
        require(msg.sender == invariantCheck, "msg.sender not invariantCheck");
        _;
    }

    modifier onlyAutoClaimOrCommitter(address user) {
        require(msg.sender == user || msg.sender == address(autoClaim), "msg.sender not committer or AutoClaim");
        _;
    }

    /**
     * @notice Initialises the contract
     * @param _factory Address of the associated `PoolFactory` contract
     * @param _autoClaim Address of the associated `AutoClaim` contract
     * @param _factoryOwner Address of the owner of the `PoolFactory`
     * @param _invariantCheck Address of the `InvariantCheck` contract
     * @param _mintingFee The percentage that is taken from each mint, given as a decimal * 10 ^ 18
     * @param _burningFee The percentage that is taken from each burn, given as a decimal * 10 ^ 18
     * @param _changeInterval The amount that the `mintingFee` will change each update interval, based on `updateMintingFee`, given as a decimal * 10 ^ 18 (same format as `_mintingFee`)
     * @dev Throws if factory contract address is null
     * @dev Throws if autoClaim contract address is null
     * @dev Throws if autoclaim contract address is null
     * @dev Only callable by the associated initializer address
     * @dev Throws if minting fee is over 100%
     * @dev Throws if burning fee is over 100%
     * @dev Emits a `ChangeIntervalSet` event on success
     */
    function initialize(
        address _factory,
        address _autoClaim,
        address _factoryOwner,
        address _feeController,
        address _invariantCheck,
        uint256 _mintingFee,
        uint256 _burningFee,
        uint256 _changeInterval
    ) external override initializer {
        require(_factory != address(0), "Factory cannot be null");
        require(_autoClaim != address(0), "AutoClaim address cannot be null");
        require(_feeController != address(0), "fee controller cannot be null");
        require(_invariantCheck != address(0), "invariantCheck cannot be null");
        updateIntervalId = 1;
        factory = _factory;
        invariantCheck = _invariantCheck;
        mintingFee = PoolSwapLibrary.convertUIntToDecimal(_mintingFee);
        burningFee = PoolSwapLibrary.convertUIntToDecimal(_burningFee);
        require(mintingFee < PoolSwapLibrary.MAX_MINTING_FEE, "Minting fee >= 100%");
        require(burningFee < PoolSwapLibrary.MAX_BURNING_FEE, "Burning fee >= 10%");
        changeInterval = PoolSwapLibrary.convertUIntToDecimal(_changeInterval);
        feeController = _feeController;
        autoClaim = IAutoClaim(_autoClaim);
        governance = _factoryOwner;
    }

    /**
     * @notice Apply commitment data to storage
     * @param pool The LeveragedPool of this PoolCommitter instance
     * @param commitType The type of commitment being made
     * @param amount The amount of tokens being committed
     * @param fromAggregateBalance If minting, burning, or rebalancing into a delta neutral position,
     *                             will tokens be taken from user's aggregate balance?
     * @param userCommit The appropriate update interval's commitment data for the user
     * @param totalCommit The appropriate update interval's commitment data for the entire pool
     */
    function applyCommitment(
        ILeveragedPool pool,
        CommitType commitType,
        uint256 amount,
        bool fromAggregateBalance,
        UserCommitment storage userCommit,
        TotalCommitment storage totalCommit
    ) private {
        Balance memory balance = userAggregateBalance[msg.sender];
        uint256 feeAmount;

        if (commitType == CommitType.LongMint || commitType == CommitType.ShortMint) {
            // We want to deduct the amount of settlement tokens that will be recorded under the commit by the minting fee
            // and then add it to the correct side of the pool
            feeAmount =
                PoolSwapLibrary.convertDecimalToUInt(PoolSwapLibrary.multiplyDecimalByUInt(mintingFee, amount)) /
                PoolSwapLibrary.WAD_PRECISION;
            amount = amount - feeAmount;
            pendingMintSettlementAmount += amount;
        }

        if (commitType == CommitType.LongMint) {
            (uint256 shortBalance, uint256 longBalance) = pool.balances();
            userCommit.longMintSettlement += amount;
            totalCommit.longMintSettlement += amount;
            // Add the fee to long side. This has been taken from the commit amount.
            pool.setNewPoolBalances(longBalance + feeAmount, shortBalance);
            // If we are minting from balance, this would already have thrown in `commit` if we are minting more than entitled too
        } else if (commitType == CommitType.LongBurn) {
            pendingLongBurnPoolTokens += amount;
            userCommit.longBurnPoolTokens += amount;
            totalCommit.longBurnPoolTokens += amount;
            // long burning: pull in long pool tokens from committer
            if (fromAggregateBalance) {
                // Burning from user's aggregate balance
                require(amount <= balance.longTokens, "Insufficient pool tokens");
                userAggregateBalance[msg.sender].longTokens -= amount;
                userCommit.balanceLongBurnPoolTokens += amount;
                // Burn from leveragedPool, because that is the official owner of the tokens before they are claimed
                pool.burnTokens(LONG_INDEX, amount, leveragedPool);
            } else {
                // Burning from user's wallet
                pool.burnTokens(LONG_INDEX, amount, msg.sender);
            }
        } else if (commitType == CommitType.ShortMint) {
            (uint256 shortBalance, uint256 longBalance) = pool.balances();
            userCommit.shortMintSettlement += amount;
            totalCommit.shortMintSettlement += amount;
            // Add the fee to short side. This has been taken from the commit amount.
            pool.setNewPoolBalances(longBalance, shortBalance + feeAmount);
            // If we are minting from balance, this would already have thrown in `commit` if we are minting more than entitled too
        } else if (commitType == CommitType.ShortBurn) {
            pendingShortBurnPoolTokens += amount;
            userCommit.shortBurnPoolTokens += amount;
            totalCommit.shortBurnPoolTokens += amount;
            if (fromAggregateBalance) {
                // Burning from user's aggregate balance
                require(amount <= balance.shortTokens, "Insufficient pool tokens");
                userAggregateBalance[msg.sender].shortTokens -= amount;
                userCommit.balanceShortBurnPoolTokens += amount;
                // Burn from leveragedPool, because that is the official owner of the tokens before they are claimed
                pool.burnTokens(SHORT_INDEX, amount, leveragedPool);
            } else {
                // Burning from user's wallet
                pool.burnTokens(SHORT_INDEX, amount, msg.sender);
            }
        } else if (commitType == CommitType.LongBurnShortMint) {
            pendingLongBurnPoolTokens += amount;
            userCommit.longBurnShortMintPoolTokens += amount;
            totalCommit.longBurnShortMintPoolTokens += amount;
            if (fromAggregateBalance) {
                require(amount <= balance.longTokens, "Insufficient pool tokens");
                userAggregateBalance[msg.sender].longTokens -= amount;
                userCommit.balanceLongBurnMintPoolTokens += amount;
                pool.burnTokens(LONG_INDEX, amount, leveragedPool);
            } else {
                pool.burnTokens(LONG_INDEX, amount, msg.sender);
            }
        } else if (commitType == CommitType.ShortBurnLongMint) {
            pendingShortBurnPoolTokens += amount;
            userCommit.shortBurnLongMintPoolTokens += amount;
            totalCommit.shortBurnLongMintPoolTokens += amount;
            if (fromAggregateBalance) {
                require(amount <= balance.shortTokens, "Insufficient pool tokens");
                userAggregateBalance[msg.sender].shortTokens -= amount;
                userCommit.balanceShortBurnMintPoolTokens += amount;
                pool.burnTokens(SHORT_INDEX, amount, leveragedPool);
            } else {
                pool.burnTokens(SHORT_INDEX, amount, msg.sender);
            }
        }
    }

    /**
     * @notice Commit to minting/burning long/short tokens after the next price change
     * @param commitType Type of commit you're doing (Long vs Short, Mint vs Burn)
     * @param amount Amount of settlement tokens you want to commit to minting; OR amount of pool
     *               tokens you want to burn
     * @param fromAggregateBalance If minting, burning, or rebalancing into a delta neutral position,
     *                             will tokens be taken from user's aggregate balance?
     * @param payForClaim True if user wants to pay for the commit to be claimed
     * @dev Emits a `CreateCommit` event on success
     */
    function commit(
        CommitType commitType,
        uint256 amount,
        bool fromAggregateBalance,
        bool payForClaim
    ) external payable override {
        require(amount > 0, "Amount must not be zero");
        updateAggregateBalance(msg.sender);
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        uint256 updateInterval = pool.updateInterval();
        uint256 lastPriceTimestamp = pool.lastPriceTimestamp();
        uint256 frontRunningInterval = pool.frontRunningInterval();

        uint256 appropriateUpdateIntervalId = PoolSwapLibrary.appropriateUpdateIntervalId(
            block.timestamp,
            lastPriceTimestamp,
            frontRunningInterval,
            updateInterval,
            updateIntervalId
        );
        TotalCommitment storage totalCommit = totalPoolCommitments[appropriateUpdateIntervalId];
        UserCommitment storage userCommit = userCommitments[msg.sender][appropriateUpdateIntervalId];

        if(userCommit.updateIntervalId == 0) {
            userCommit.updateIntervalId = appropriateUpdateIntervalId;
        }
        if(totalCommit.updateIntervalId == 0) {
            totalCommit.updateIntervalId = appropriateUpdateIntervalId;
        }

        uint256 length = unAggregatedCommitments[msg.sender].length;
        if (length == 0 || unAggregatedCommitments[msg.sender][length - 1] < appropriateUpdateIntervalId) {
            // Push to the array if the most recent commitment was done in a prior update interval
            unAggregatedCommitments[msg.sender].push(appropriateUpdateIntervalId);
        }

        /*
         * Below, we want to follow the "Checks, Effects, Interactions" pattern.
         * `applyCommitment` adheres to the pattern, so we must put our effects before this, and interactions after.
         * Hence, we do the storage change if `fromAggregateBalance == true` before calling `applyCommitment`, and do the interaction if `fromAggregateBalance == false` after.
         * Lastly, we call `AutoClaim::makePaidClaimRequest`, which is an external interaction (albeit with a protocol contract).
         */
        if ((commitType == CommitType.LongMint || commitType == CommitType.ShortMint) && fromAggregateBalance) {
            // Want to take away from their balance's settlement tokens
            require(amount <= userAggregateBalance[msg.sender].settlementTokens, "Insufficient settlement tokens");
            userAggregateBalance[msg.sender].settlementTokens -= amount;
        }

        applyCommitment(pool, commitType, amount, fromAggregateBalance, userCommit, totalCommit);

        if (commitType == CommitType.LongMint || (commitType == CommitType.ShortMint && !fromAggregateBalance)) {
            // minting: pull in the settlement token from the committer
            // Do not need to transfer if minting using aggregate balance tokens, since the leveraged pool already owns these tokens.
            pool.settlementTokenTransferFrom(msg.sender, leveragedPool, amount);
        }

        if (payForClaim) {
            require(msg.value != 0, "Must pay for claim");
            autoClaim.makePaidClaimRequest{value: msg.value}(msg.sender);
        } else {
            require(msg.value == 0, "msg.value must be zero");
        }

        emit CreateCommit(
            msg.sender,
            amount,
            commitType,
            appropriateUpdateIntervalId,
            fromAggregateBalance,
            payForClaim,
            mintingFee
        );
    }

    /**
     * @notice Claim user's balance. This can be done either by the user themself or by somebody else on their behalf.
     * @param user Address of the user to claim against
     * @dev Updates aggregate user balances
     * @dev Emits a `Claim` event on success
     */
    function claim(address user) external override onlyAutoClaimOrCommitter(user) {
        updateAggregateBalance(user);
        Balance memory balance = userAggregateBalance[user];
        ILeveragedPool pool = ILeveragedPool(leveragedPool);

        /* update bookkeeping *before* external calls! */
        delete userAggregateBalance[user];
        emit Claim(user);

        if (msg.sender == user && autoClaim.checkUserClaim(user, address(this))) {
            // If the committer is claiming for themself and they have a valid pending claim, clear it.
            autoClaim.withdrawUserClaimRequest(user);
        }

        if (balance.settlementTokens > 0) {
            pool.settlementTokenTransfer(user, balance.settlementTokens);
        }
        if (balance.longTokens > 0) {
            pool.poolTokenTransfer(true, user, balance.longTokens);
        }
        if (balance.shortTokens > 0) {
            pool.poolTokenTransfer(false, user, balance.shortTokens);
        }
    }

    /**
     * @notice Retrieves minting fee from each mint being left in the pool
     * @return Minting fee
     */
    function getMintingFee() public view returns (uint256) {
        return PoolSwapLibrary.convertDecimalToUInt(mintingFee);
    }

    /**
     * @notice Retrieves burning fee from each burn being left in the pool
     * @return Burning fee
     */
    function getBurningFee() public view returns (uint256) {
        return PoolSwapLibrary.convertDecimalToUInt(burningFee);
    }

    /**
     * @notice Executes every commitment specified in the list
     * @param _commits Array of `TotalCommitment`s
     * @param longTotalSupply The current running total supply of long pool tokens
     * @param shortTotalSupply The current running total supply of short pool tokens
     * @param longBalance The amount of settlement tokens in the long side of the pool
     * @param shortBalance The amount of settlement tokens in the short side of the pool
     * @return newLongTotalSupply The total supply of long pool tokens as a result of minting
     * @return newShortTotalSupply The total supply of short pool tokens as a result of minting
     * @return newLongBalance The amount of settlement tokens in the long side of the pool as a result of minting and burning
     * @return newShortBalance The amount of settlement tokens in the short side of the pool as a result of minting and burning
     */
    function executeGivenCommitments(
        TotalCommitment memory _commits,
        uint256 longTotalSupply,
        uint256 shortTotalSupply,
        uint256 longBalance,
        uint256 shortBalance
    )
        internal
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        pendingMintSettlementAmount =
            pendingMintSettlementAmount -
            totalPoolCommitments[_commits.updateIntervalId].longMintSettlement -
            totalPoolCommitments[_commits.updateIntervalId].shortMintSettlement;

        BalancesAndSupplies memory balancesAndSupplies = BalancesAndSupplies({
            newShortBalance: _commits.shortMintSettlement + shortBalance,
            newLongBalance: _commits.longMintSettlement + longBalance,
            longMintPoolTokens: 0,
            shortMintPoolTokens: 0,
            longBurnInstantMintSettlement: 0,
            shortBurnInstantMintSettlement: 0,
            totalLongBurnPoolTokens: _commits.longBurnPoolTokens + _commits.longBurnShortMintPoolTokens,
            totalShortBurnPoolTokens: _commits.shortBurnPoolTokens + _commits.shortBurnLongMintPoolTokens
        });

        // Update price before values change
        priceHistory[_commits.updateIntervalId] = Prices({
            longPrice: PoolSwapLibrary.getPrice(longBalance, longTotalSupply + pendingLongBurnPoolTokens),
            shortPrice: PoolSwapLibrary.getPrice(shortBalance, shortTotalSupply + pendingShortBurnPoolTokens)
        });

        // Amount of collateral tokens that are generated from the long burn into instant mints
        balancesAndSupplies.longBurnInstantMintSettlement = PoolSwapLibrary.getWithdrawAmountOnBurn(
            longTotalSupply,
            _commits.longBurnShortMintPoolTokens,
            longBalance,
            pendingLongBurnPoolTokens
        );
        balancesAndSupplies.newShortBalance += balancesAndSupplies.longBurnInstantMintSettlement;
        // Amount of collateral tokens that are generated from the short burn into instant mints
        balancesAndSupplies.shortBurnInstantMintSettlement = PoolSwapLibrary.getWithdrawAmountOnBurn(
            shortTotalSupply,
            _commits.shortBurnLongMintPoolTokens,
            shortBalance,
            pendingShortBurnPoolTokens
        );
        balancesAndSupplies.newLongBalance += balancesAndSupplies.shortBurnInstantMintSettlement;

        // Long Mints
        balancesAndSupplies.longMintPoolTokens = PoolSwapLibrary.getMintAmount(
            longTotalSupply, // long token total supply,
            _commits.longMintSettlement + balancesAndSupplies.shortBurnInstantMintSettlement, // Add the settlement tokens that will be generated from burning shorts for instant long mint
            longBalance, // total quote tokens in the long pool
            pendingLongBurnPoolTokens // total pool tokens commited to be burned
        );

        // Long Burns
        balancesAndSupplies.newLongBalance -= PoolSwapLibrary.getWithdrawAmountOnBurn(
            longTotalSupply,
            balancesAndSupplies.totalLongBurnPoolTokens,
            longBalance,
            pendingLongBurnPoolTokens
        );

        // Short Mints
        balancesAndSupplies.shortMintPoolTokens = PoolSwapLibrary.getMintAmount(
            shortTotalSupply, // short token total supply
            _commits.shortMintSettlement + balancesAndSupplies.longBurnInstantMintSettlement, // Add the settlement tokens that will be generated from burning longs for instant short mint
            shortBalance,
            pendingShortBurnPoolTokens
        );

        // Short Burns
        balancesAndSupplies.newShortBalance -= PoolSwapLibrary.getWithdrawAmountOnBurn(
            shortTotalSupply,
            balancesAndSupplies.totalShortBurnPoolTokens,
            shortBalance,
            pendingShortBurnPoolTokens
        );

        pendingLongBurnPoolTokens -= balancesAndSupplies.totalLongBurnPoolTokens;
        pendingShortBurnPoolTokens -= balancesAndSupplies.totalShortBurnPoolTokens;

        return (
            longTotalSupply + balancesAndSupplies.longMintPoolTokens,
            shortTotalSupply + balancesAndSupplies.shortMintPoolTokens,
            balancesAndSupplies.newLongBalance,
            balancesAndSupplies.newShortBalance
        );
    }

    /**
     * @notice Executes all commitments currently queued for the associated `LeveragedPool`
     * @dev Only callable by the associated `LeveragedPool` contract
     * @dev Emits an `ExecutedCommitsForInterval` event for each update interval processed
     * @param lastPriceTimestamp The timestamp when the last price update happened
     * @param updateInterval The number of seconds that must occur between upkeeps
     * @param longBalance The amount of settlement tokens in the long side of the pool
     * @param shortBalance The amount of settlement tokens in the short side of the pool
     * @return longTotalSupplyChange The amount of long pool tokens that have been added to the supply, passed back to LeveragedPool to mint them.
     * @return shortTotalSupplyChange The amount of short pool tokens that have been added to the supply, passed back to LeveragedPool to mint them.
     * @return newLongBalance The updated longBalance
     * @return newShortBalance The updated longBalance
     * @return lastPriceTimestamp The correct price timestamp for LeveragedPool to set. This is in case not all update intervals get upkept, we can track the time of the most recent upkept one.
     */
    function executeCommitments(
        uint256 lastPriceTimestamp,
        uint256 updateInterval,
        uint256 longBalance,
        uint256 shortBalance
    )
        external
        override
        onlyPool
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        uint8 counter = 1;

        /*
         * (old)
         * updateIntervalId
         * |
         * |    updateIntervalId
         * |    |
         * |    |    counter
         * |    |    |
         * |    |    |              (end)
         * |    |    |              |
         * V    V    V              V
         * +----+----+----+~~~~+----+
         * |    |    |    |....|    |
         * +----+----+----+~~~~+----+
         *
         * Iterate over the sequence of possible update periods from the most
         * recent (i.e., the value of `updateIntervalId` as at the entry point
         * of this function) until the end of the queue.
         *
         * At each iteration, execute all of the (total) commitments for the
         * pool for that period and then remove them from the queue.
         *
         * In reality, this should never iterate more than once, since more than one update interval
         * should never be passed without the previous one being upkept.
         */

        CommitmentExecutionTracking memory executionTracking = CommitmentExecutionTracking({
            longTotalSupply: IERC20(tokens[LONG_INDEX]).totalSupply(),
            shortTotalSupply: IERC20(tokens[SHORT_INDEX]).totalSupply(),
            longTotalSupplyBefore: 0,
            shortTotalSupplyBefore: 0,
            _updateIntervalId: 0
        });

        executionTracking.longTotalSupplyBefore = executionTracking.longTotalSupply;
        executionTracking.shortTotalSupplyBefore = executionTracking.shortTotalSupply;

        while (counter <= MAX_ITERATIONS) {
            if (block.timestamp >= lastPriceTimestamp + updateInterval * counter) {
                // Another update interval has passed, so we have to do the nextIntervalCommit as well
                executionTracking._updateIntervalId = updateIntervalId;
                burnFeeHistory[executionTracking._updateIntervalId] = burningFee;
                (
                    executionTracking.longTotalSupply,
                    executionTracking.shortTotalSupply,
                    longBalance,
                    shortBalance
                ) = executeGivenCommitments(
                    totalPoolCommitments[executionTracking._updateIntervalId],
                    executionTracking.longTotalSupply,
                    executionTracking.shortTotalSupply,
                    longBalance,
                    shortBalance
                );
                emit ExecutedCommitsForInterval(executionTracking._updateIntervalId, burningFee);
                delete totalPoolCommitments[executionTracking._updateIntervalId];

                // counter overflowing would require an unrealistic number of update intervals
                unchecked {
                    updateIntervalId += 1;
                }
            } else {
                break;
            }
            // counter overflowing would require an unrealistic number of update intervals to be updated
            // This wouldn't fit in a block, anyway.
            unchecked {
                counter += 1;
            }
        }

        updateMintingFee(
            PoolSwapLibrary.getPrice(longBalance, executionTracking.longTotalSupply),
            PoolSwapLibrary.getPrice(shortBalance, executionTracking.shortTotalSupply)
        );

        // Subtract counter by 1 to accurately reflect how many update intervals were executed
        if (block.timestamp >= lastPriceTimestamp + updateInterval * (counter - 1)) {
            // check if finished
            // shift lastPriceTimestamp so next time the executeCommitments() will continue where it left off
            lastPriceTimestamp = lastPriceTimestamp + updateInterval * (counter - 1);
        } else {
            // Set to current time if finished every update interval
            lastPriceTimestamp = block.timestamp;
        }
        return (
            executionTracking.longTotalSupply - executionTracking.longTotalSupplyBefore,
            executionTracking.shortTotalSupply - executionTracking.shortTotalSupplyBefore,
            longBalance,
            shortBalance,
            lastPriceTimestamp
        );
    }

    function updateMintingFee(bytes16 longTokenPrice, bytes16 shortTokenPrice) private {
        bytes16 multiple = PoolSwapLibrary.multiplyBytes(longTokenPrice, shortTokenPrice);
        if (PoolSwapLibrary.compareDecimals(PoolSwapLibrary.ONE, multiple) == -1) {
            // longTokenPrice * shortTokenPrice > 1
            if (PoolSwapLibrary.compareDecimals(mintingFee, changeInterval) == -1) {
                // mintingFee < changeInterval. Prevent underflow by setting mintingFee to lowest possible value (0)
                mintingFee = 0;
            } else {
                mintingFee = PoolSwapLibrary.subtractBytes(mintingFee, changeInterval);
            }
        } else {
            // longTokenPrice * shortTokenPrice <= 1
            mintingFee = PoolSwapLibrary.addBytes(mintingFee, changeInterval);

            if (PoolSwapLibrary.compareDecimals(mintingFee, PoolSwapLibrary.MAX_MINTING_FEE) == 1) {
                // mintingFee is greater than 1 (100%).
                // We want to cap this at a theoretical max of 100%
                mintingFee = PoolSwapLibrary.MAX_MINTING_FEE;
            }
        }
    }

    /**
     * @notice Updates the aggregate balance based on the result of application
     *          of the provided (user) commitment
     * @param _commit Commitment to apply
     * @return _newLongTokens Quantity of long pool tokens post-application
     * @return _newShortTokens Quantity of short pool tokens post-application
     * @return _longBurnFee Quantity of settlement tokens taken as a fee from long burns
     * @return _shortBurnFee Quantity of settlement tokens taken as a fee from short burns
     * @return _newSettlementTokens Quantity of settlement tokens post
     *                                  application
     * @dev Wraps two (pure) library functions from `PoolSwapLibrary`
     */
    function getBalanceSingleCommitment(UserCommitment memory _commit)
        internal
        view
        returns (
            uint256 _newLongTokens,
            uint256 _newShortTokens,
            uint256 _longBurnFee,
            uint256 _shortBurnFee,
            uint256 _newSettlementTokens
        )
    {
        PoolSwapLibrary.UpdateData memory updateData = PoolSwapLibrary.UpdateData({
            longPrice: priceHistory[_commit.updateIntervalId].longPrice,
            shortPrice: priceHistory[_commit.updateIntervalId].shortPrice,
            currentUpdateIntervalId: updateIntervalId,
            updateIntervalId: _commit.updateIntervalId,
            longMintSettlement: _commit.longMintSettlement,
            longBurnPoolTokens: _commit.longBurnPoolTokens,
            shortMintSettlement: _commit.shortMintSettlement,
            shortBurnPoolTokens: _commit.shortBurnPoolTokens,
            longBurnShortMintPoolTokens: _commit.longBurnShortMintPoolTokens,
            shortBurnLongMintPoolTokens: _commit.shortBurnLongMintPoolTokens,
            burnFee: burnFeeHistory[_commit.updateIntervalId]
        });

        (_newLongTokens, _newShortTokens, _longBurnFee, _shortBurnFee, _newSettlementTokens) = PoolSwapLibrary
            .getUpdatedAggregateBalance(updateData);
    }

    /**
     * @notice Add the result of a user's most recent commit to their aggregated balance
     * @param user Address of the given user
     * @dev Updates the `userAggregateBalance` mapping by applying `BalanceUpdate`s derived from iteration over the entirety of unaggregated commitments associated with the given user
     * @dev Emits an `AggregateBalanceUpdated` event upon successful termination
     */
    function updateAggregateBalance(address user) public override {
        Balance storage balance = userAggregateBalance[user];

        BalanceUpdate memory update = BalanceUpdate({
            _updateIntervalId: updateIntervalId,
            _newLongTokensSum: 0,
            _newShortTokensSum: 0,
            _newSettlementTokensSum: 0,
            _longBurnFee: 0,
            _shortBurnFee: 0,
            _maxIterations: 0
        });

        uint256[] memory currentIntervalIds = unAggregatedCommitments[user];
        uint256 unAggregatedLength = currentIntervalIds.length;

        update._maxIterations = unAggregatedLength < MAX_ITERATIONS ? uint8(unAggregatedLength) : MAX_ITERATIONS; // casting to uint8 is safe because we know it is less than MAX_ITERATIONS, a uint8

        // Iterate from the most recent up until the current update interval
        for (uint256 i = 0; i < update._maxIterations; i++) {
            uint256 id = currentIntervalIds[i];
            if (id == 0) {
                continue;
            }
            UserCommitment memory commitment = userCommitments[user][id];

            if (commitment.updateIntervalId < updateIntervalId) {
                (
                    uint256 _newLongTokens,
                    uint256 _newShortTokens,
                    uint256 _longBurnFee,
                    uint256 _shortBurnFee,
                    uint256 _newSettlementTokens
                ) = getBalanceSingleCommitment(commitment);
                update._newLongTokensSum += _newLongTokens;
                update._newShortTokensSum += _newShortTokens;
                update._newSettlementTokensSum += _newSettlementTokens;
                update._longBurnFee += _longBurnFee;
                update._shortBurnFee += _shortBurnFee;
                delete userCommitments[user][id];
                uint256[] storage commitmentIds = unAggregatedCommitments[user];
                if (unAggregatedLength > MAX_ITERATIONS && i < commitmentIds.length - 1 && commitmentIds.length > 1) {
                    // We only enter this branch if our iterations are capped (i.e. we do not delete the array after the loop)
                    // Order doesn't actually matter in this array, so we can just put the last element into this index
                    commitmentIds[i] = commitmentIds[commitmentIds.length - 1];
                    commitmentIds.pop();
                } else {
                    commitmentIds.pop();
                }
            } else {
                // Clear them now that they have been accounted for in the balance
                userCommitments[user][id].balanceLongBurnPoolTokens = 0;
                userCommitments[user][id].balanceShortBurnPoolTokens = 0;
                userCommitments[user][id].balanceLongBurnMintPoolTokens = 0;
                userCommitments[user][id].balanceShortBurnMintPoolTokens = 0;
                // This commitment wasn't ready to be completely added to the balance, so copy it over into the new ID array
                if (unAggregatedLength <= MAX_ITERATIONS) {
                    storageArrayPlaceHolder.push(currentIntervalIds[i]);
                }
            }
        }

        if (unAggregatedLength <= MAX_ITERATIONS) {
            // We got through all update intervals, so we can replace all unaggregated update interval IDs
            delete unAggregatedCommitments[user];
            unAggregatedCommitments[user] = storageArrayPlaceHolder;
            delete storageArrayPlaceHolder;
        }

        // Add new tokens minted, and remove the ones that were burnt from this balance
        balance.longTokens += update._newLongTokensSum;
        balance.shortTokens += update._newShortTokensSum;
        balance.settlementTokens += update._newSettlementTokensSum;

        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        (uint256 shortBalance, uint256 longBalance) = pool.balances();
        pool.setNewPoolBalances(longBalance + update._longBurnFee, shortBalance + update._shortBurnFee);

        emit AggregateBalanceUpdated(user);
    }

    /**
     * @return which update interval ID a commit would be placed into if made now
     * @dev Calls PoolSwapLibrary::appropriateUpdateIntervalId
     */
    function getAppropriateUpdateIntervalId() external view override returns (uint128) {
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        return
            uint128(
                PoolSwapLibrary.appropriateUpdateIntervalId(
                    block.timestamp,
                    pool.lastPriceTimestamp(),
                    pool.frontRunningInterval(),
                    pool.updateInterval(),
                    updateIntervalId
                )
            );
    }

    /**
     * @notice A copy of `updateAggregateBalance` that returns the aggregated balance without updating it
     * @param user Address of the given user
     * @return Associated `Balance` for the given user after aggregation
     */
    function getAggregateBalance(address user) external view override returns (Balance memory) {
        Balance memory _balance = userAggregateBalance[user];

        BalanceUpdate memory update = BalanceUpdate({
            _updateIntervalId: updateIntervalId,
            _newLongTokensSum: 0,
            _newShortTokensSum: 0,
            _newSettlementTokensSum: 0,
            _longBurnFee: 0,
            _shortBurnFee: 0,
            _maxIterations: 0
        });

        uint256[] memory currentIntervalIds = unAggregatedCommitments[user];
        uint256 unAggregatedLength = currentIntervalIds.length;

        update._maxIterations = unAggregatedLength < MAX_ITERATIONS ? uint8(unAggregatedLength) : MAX_ITERATIONS; // casting to uint8 is safe because we know it is less than MAX_ITERATIONS, a uint8

        // Iterate from the most recent up until the current update interval
        for (uint256 i = 0; i < update._maxIterations; i++) {
            uint256 id = currentIntervalIds[i];
            if (id == 0) {
                continue;
            }
            UserCommitment memory commitment = userCommitments[user][id];

            /* If the update interval of commitment has not yet passed, we still
            want to deduct burns from the balance from a user's balance.
            Therefore, this should happen outside of the if block below.*/
            if (commitment.updateIntervalId < updateIntervalId) {
                (
                    uint256 _newLongTokens,
                    uint256 _newShortTokens,
                    ,
                    ,
                    uint256 _newSettlementTokens
                ) = getBalanceSingleCommitment(commitment);
                update._newLongTokensSum += _newLongTokens;
                update._newShortTokensSum += _newShortTokens;
                update._newSettlementTokensSum += _newSettlementTokens;
            }
        }

        // Add new tokens minted, and remove the ones that were burnt from this balance
        _balance.longTokens += update._newLongTokensSum;
        _balance.shortTokens += update._newShortTokensSum;
        _balance.settlementTokens += update._newSettlementTokensSum;

        return _balance;
    }

    /**
     * @notice Sets the settlement token address and the address of the associated `LeveragedPool` contract to the provided values
     * @param _leveragedPool Address of the pool to use
     * @dev Only callable by the associated `PoolFactory` contract
     * @dev Throws if either address are null
     * @dev Emits a `SettlementAndPoolChanged` event on success
     */
    function setPool(address _leveragedPool) external override onlyFactory {
        require(_leveragedPool != address(0), "Leveraged pool address cannot be 0 address");

        leveragedPool = _leveragedPool;
        tokens = ILeveragedPool(leveragedPool).poolTokens();
    }

    /**
     * @notice Sets the burning fee to be applied to future burn commitments indefinitely
     * @param _burningFee The new burning fee
     * @dev Converts `_burningFee` to a `bytes16` to be compatible with arithmetic library
     * @dev Emits a `BurningFeeSet` event on success
     */
    function setBurningFee(uint256 _burningFee) external override onlyFeeController {
        burningFee = PoolSwapLibrary.convertUIntToDecimal(_burningFee);
        require(burningFee < PoolSwapLibrary.MAX_BURNING_FEE, "Burning fee >= 10%");
        emit BurningFeeSet(_burningFee);
    }

    /**
     * @notice Sets the minting fee to be applied to future burn commitments indefinitely
     * @param _mintingFee The new minting fee
     * @dev Converts `_mintingFee` to a `bytes16` to be compatible with arithmetic library
     * @dev Emits a `MintingFeeSet` event on success
     */
    function setMintingFee(uint256 _mintingFee) external override onlyFeeController {
        mintingFee = PoolSwapLibrary.convertUIntToDecimal(_mintingFee);
        require(mintingFee < PoolSwapLibrary.MAX_MINTING_FEE, "Minting fee >= 100%");
        emit MintingFeeSet(_mintingFee);
    }

    /**
     * @notice Sets the change interval used to update the minting fee every update interval
     * @param _changeInterval The new change interval
     * @dev Converts `_changeInterval` to a `bytes16` to be compatible with arithmetic library TODO UPDATE
     * @dev Emits a `ChangeIntervalSet` event on success
     */
    function setChangeInterval(uint256 _changeInterval) external override onlyFeeController {
        changeInterval = PoolSwapLibrary.convertUIntToDecimal(_changeInterval);
        emit ChangeIntervalSet(_changeInterval);
    }

    function setFeeController(address _feeController) external override {
        require(msg.sender == governance || msg.sender == feeController, "Cannot set feeController");
        feeController = _feeController;
        emit FeeControllerSet(_feeController);
    }

    /**
     * @notice Pauses the pool
     * @dev Prevents all state updates until unpaused
     */
    function pause() external override onlyInvariantCheckContract {
        paused = true;
        emit Paused();
    }

    /**
     * @notice Unpauses the pool
     * @dev Prevents all state updates until unpaused
     */
    function unpause() external override onlyGov {
        paused = false;
        emit Unpaused();
    }
}
