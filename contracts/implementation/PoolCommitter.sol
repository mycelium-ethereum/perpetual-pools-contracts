//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IPoolCommitter.sol";
import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPoolFactory.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./PoolSwapLibrary.sol";

/// @title This contract is responsible for handling commitment logic
contract PoolCommitter is IPoolCommitter, Ownable {
    // #### Globals
    uint128 public constant LONG_INDEX = 0;
    uint128 public constant SHORT_INDEX = 1;

    address public leveragedPool;
    uint128 public updateIntervalId = 1;
    // Index 0 is the LONG token, index 1 is the SHORT token.
    // Fetched from the LeveragedPool when leveragedPool is set
    address[2] public tokens;

    // Address => User's commitment amounts in a given updateInterval
    mapping(address => UserCommitment) public userMostRecentCommit;
    mapping(address => UserCommitment) public userNextIntervalCommit;
    // Total commitment amounts in a given updateInterval
    TotalCommitment public totalMostRecentCommit;
    TotalCommitment public totalNextIntervalCommit;
    mapping(uint256 => Prices) public priceHistory; // updateIntervalId => tokenPrice
    mapping(address => Balance) public userAggregateBalance;

    address public factory;
    address public governance;

    constructor(address _factory) {
        require(_factory != address(0), "Factory address cannot be null");
        // set the factory on deploy
        factory = _factory;
        governance = IPoolFactory(factory).getOwner();
    }

    /**
     * @notice Apply commitment data to storage
     * @param pool The LeveragedPool of this PoolCommitter instance
     * @param commitType The type of commitment being made
     * @param amount The amount of tokens being committed
     * @param fromAggregateBalance If minting, burning, or rebalancing into a delta neutral position,
     *                             will tokens be taken from user's aggregate balance?
     * @param userCommit The appropriate update interval's commitment data for the user
     * @param userCommit The appropriate update interval's commitment data for the entire pool
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

        if (commitType == CommitType.LongMint) {
            userCommit.longMintAmount += amount;
            totalCommit.longMintAmount += amount;
            // If we are minting from balance, this would already have thrown in `commit` if we are minting more than entitled too
        } else if (commitType == CommitType.LongBurn) {
            userCommit.longBurnAmount += amount;
            totalCommit.longBurnAmount += amount;
            // long burning: pull in long pool tokens from committer
            if (fromAggregateBalance) {
                // Burning from user's aggregate balance
                userCommit.balanceLongBurnAmount += amount;
                // This require statement is only needed in this branch, as `pool.burnTokens` will revert if burning too many
                require(userCommit.balanceLongBurnAmount <= balance.longTokens, "Insufficient pool tokens");
                // Burn from leveragedPool, because that is the official owner of the tokens before they are claimed
                pool.burnTokens(true, amount, leveragedPool);
            } else {
                // Burning from user's wallet
                pool.burnTokens(true, amount, msg.sender);
            }
        } else if (commitType == CommitType.ShortMint) {
            userCommit.shortMintAmount += amount;
            totalCommit.shortMintAmount += amount;
            // If we are minting from balance, this would already have thrown in `commit` if we are minting more than entitled too
        } else if (commitType == CommitType.ShortBurn) {
            userCommit.shortBurnAmount += amount;
            totalCommit.shortBurnAmount += amount;
            if (fromAggregateBalance) {
                // Burning from user's aggregate balance
                userCommit.balanceShortBurnAmount += amount;
                // This require statement is only needed in this branch, as `pool.burnTokens` will revert if burning too many
                require(userCommit.balanceShortBurnAmount <= balance.shortTokens, "Insufficient pool tokens");
                // Burn from leveragedPool, because that is the official owner of the tokens before they are claimed
                pool.burnTokens(false, amount, leveragedPool);
            } else {
                // Burning from user's wallet
                pool.burnTokens(false, amount, msg.sender);
            }
        } else if (commitType == CommitType.LongBurnShortMint) {
            userCommit.longBurnShortMintAmount += amount;
            totalCommit.longBurnShortMintAmount += amount;
            if (fromAggregateBalance) {
                userCommit.balanceLongBurnMintAmount += amount;
                require(userCommit.balanceLongBurnMintAmount <= balance.longTokens, "Insufficient pool tokens");
                pool.burnTokens(true, amount, leveragedPool);
            } else {
                pool.burnTokens(true, amount, msg.sender);
            }
        } else if (commitType == CommitType.ShortBurnLongMint) {
            userCommit.shortBurnLongMintAmount += amount;
            totalCommit.shortBurnLongMintAmount += amount;
            if (fromAggregateBalance) {
                userCommit.balanceShortBurnMintAmount += amount;
                require(userCommit.balanceShortBurnMintAmount <= balance.shortTokens, "Insufficient pool tokens");
                pool.burnTokens(false, amount, leveragedPool);
            } else {
                pool.burnTokens(false, amount, msg.sender);
            }
        }
    }

    /**
     * @notice Commit to minting/burning long/short tokens after the next price change
     * @param commitType Type of commit you're doing (Long vs Short, Mint vs Burn)
     * @param amount Amount of quote tokens you want to commit to minting; OR amount of pool
     *               tokens you want to burn
     * @param fromAggregateBalance If minting, burning, or rebalancing into a delta neutral position,
     *                             will tokens be taken from user's aggregate balance?
     */
    function commit(
        CommitType commitType,
        uint256 amount,
        bool fromAggregateBalance
    ) external override updateBalance {
        require(amount > 0, "Amount must not be zero");
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        uint256 updateInterval = pool.updateInterval();
        uint256 lastPriceTimestamp = pool.lastPriceTimestamp();
        uint256 frontRunningInterval = pool.frontRunningInterval();

        TotalCommitment storage totalCommit;
        UserCommitment storage userCommit;

        if (
            PoolSwapLibrary.isBeforeFrontRunningInterval(
                block.timestamp,
                lastPriceTimestamp,
                updateInterval,
                frontRunningInterval
            )
        ) {
            totalCommit = totalMostRecentCommit;
            userCommit = userMostRecentCommit[msg.sender];
            userCommit.updateIntervalId = updateIntervalId;
        } else {
            totalCommit = totalNextIntervalCommit;
            userCommit = userNextIntervalCommit[msg.sender];
            userCommit.updateIntervalId = updateIntervalId + 1;
        }

        if (commitType == CommitType.LongMint || commitType == CommitType.ShortMint) {
            // minting: pull in the quote token from the committer
            // Do not need to transfer if minting using aggregate balance tokens, since the leveraged pool already owns these tokens.
            if (!fromAggregateBalance) {
                pool.quoteTokenTransferFrom(msg.sender, leveragedPool, amount);
            } else {
                // Want to take away from their balance's settlement tokens
                userAggregateBalance[msg.sender].settlementTokens -= amount;
            }
        }

        applyCommitment(pool, commitType, amount, fromAggregateBalance, userCommit, totalCommit);

        emit CreateCommit(msg.sender, amount, commitType);
    }

    /**
     * @notice Claim user's balance. This can be done either by the user themself or by somebody else on their behalf.
     */
    function claim(address user) external override updateBalance {
        Balance memory balance = userAggregateBalance[user];
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        if (balance.settlementTokens > 0) {
            pool.quoteTokenTransfer(user, balance.settlementTokens);
        }
        if (balance.longTokens > 0) {
            pool.poolTokenTransfer(true, user, balance.longTokens);
        }
        if (balance.shortTokens > 0) {
            pool.poolTokenTransfer(false, user, balance.shortTokens);
        }
        delete userAggregateBalance[user];
        emit Claim(user);
    }

    function executeGivenCommitments(TotalCommitment memory _commits) internal {
        ILeveragedPool pool = ILeveragedPool(leveragedPool);

        BalancesAndSupplies memory balancesAndSupplies = BalancesAndSupplies({
            shortBalance: pool.shortBalance(),
            longBalance: pool.longBalance(),
            longTotalSupplyBefore: IERC20(tokens[0]).totalSupply(),
            shortTotalSupplyBefore: IERC20(tokens[1]).totalSupply()
        });

        uint256 totalLongBurn = _commits.longBurnAmount + _commits.longBurnShortMintAmount;
        uint256 totalShortBurn = _commits.shortBurnAmount + _commits.shortBurnLongMintAmount;
        // Update price before values change
        priceHistory[updateIntervalId] = Prices({
            longPrice: PoolSwapLibrary.getPrice(
                balancesAndSupplies.longBalance,
                balancesAndSupplies.longTotalSupplyBefore + totalLongBurn
            ),
            shortPrice: PoolSwapLibrary.getPrice(
                balancesAndSupplies.shortBalance,
                balancesAndSupplies.shortTotalSupplyBefore + totalShortBurn
            )
        });

        // Amount of collateral tokens that are generated from the long burn into instant mints
        uint256 longBurnInstantMintAmount = PoolSwapLibrary.getWithdrawAmountOnBurn(
            balancesAndSupplies.longTotalSupplyBefore,
            _commits.longBurnShortMintAmount,
            balancesAndSupplies.longBalance,
            totalLongBurn
        );
        // Amount of collateral tokens that are generated from the short burn into instant mints
        uint256 shortBurnInstantMintAmount = PoolSwapLibrary.getWithdrawAmountOnBurn(
            balancesAndSupplies.shortTotalSupplyBefore,
            _commits.shortBurnLongMintAmount,
            balancesAndSupplies.shortBalance,
            totalShortBurn
        );

        // Long Mints
        uint256 longMintAmount = PoolSwapLibrary.getMintAmount(
            balancesAndSupplies.longTotalSupplyBefore, // long token total supply,
            _commits.longMintAmount + shortBurnInstantMintAmount, // Add the collateral tokens that will be generated from burning shorts for instant long mint
            balancesAndSupplies.longBalance, // total quote tokens in the long pull
            totalLongBurn // total pool tokens commited to be burned
        );

        if (longMintAmount > 0) {
            pool.mintTokens(true, longMintAmount, leveragedPool);
        }

        // Long Burns
        uint256 longBurnAmount = PoolSwapLibrary.getWithdrawAmountOnBurn(
            balancesAndSupplies.longTotalSupplyBefore,
            totalLongBurn,
            balancesAndSupplies.longBalance,
            totalLongBurn
        );

        // Short Mints
        uint256 shortMintAmount = PoolSwapLibrary.getMintAmount(
            balancesAndSupplies.shortTotalSupplyBefore, // short token total supply
            _commits.shortMintAmount + longBurnInstantMintAmount, // Add the collateral tokens that will be generated from burning longs for instant short mint
            balancesAndSupplies.shortBalance,
            totalShortBurn
        );

        if (shortMintAmount > 0) {
            pool.mintTokens(false, shortMintAmount, leveragedPool);
        }

        // Short Burns
        uint256 shortBurnAmount = PoolSwapLibrary.getWithdrawAmountOnBurn(
            balancesAndSupplies.shortTotalSupplyBefore,
            totalShortBurn,
            balancesAndSupplies.shortBalance,
            totalShortBurn
        );

        uint256 newLongBalance = balancesAndSupplies.longBalance +
            _commits.longMintAmount -
            longBurnAmount +
            shortBurnInstantMintAmount;
        uint256 newShortBalance = balancesAndSupplies.shortBalance +
            _commits.shortMintAmount -
            shortBurnAmount +
            longBurnInstantMintAmount;

        updateIntervalId += 1;

        // Update the collateral on each side
        pool.setNewPoolBalances(newLongBalance, newShortBalance);
    }

    function executeCommitments() external override onlyPool {
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        executeGivenCommitments(totalMostRecentCommit);

        totalMostRecentCommit = totalNextIntervalCommit;
        delete totalNextIntervalCommit;

        uint32 two = 2;
        if (block.timestamp >= pool.lastPriceTimestamp() + pool.updateInterval() * two) {
            // Another update interval has passed, so we have to do the nextIntervalCommit as well
            executeGivenCommitments(totalMostRecentCommit);
            delete totalMostRecentCommit;
        }
    }

    function updateBalanceSingleCommitment(UserCommitment memory _commit)
        internal
        view
        returns (
            uint256 _newLongTokens,
            uint256 _newShortTokens,
            uint256 _newSettlementTokens
        )
    {
        PoolSwapLibrary.UpdateData memory updateData = PoolSwapLibrary.UpdateData({
            longPrice: priceHistory[_commit.updateIntervalId].longPrice,
            shortPrice: priceHistory[_commit.updateIntervalId].shortPrice,
            currentUpdateIntervalId: updateIntervalId,
            updateIntervalId: _commit.updateIntervalId,
            longMintAmount: _commit.longMintAmount,
            longBurnAmount: _commit.longBurnAmount,
            shortMintAmount: _commit.shortMintAmount,
            shortBurnAmount: _commit.shortBurnAmount,
            longBurnShortMintAmount: _commit.longBurnShortMintAmount,
            shortBurnLongMintAmount: _commit.shortBurnLongMintAmount
        });

        (_newLongTokens, _newShortTokens, _newSettlementTokens) = PoolSwapLibrary.getUpdatedAggregateBalance(
            updateData
        );
    }

    /**
     * @notice Add the result of a user's most recent commit to their aggregateBalance
     */
    function updateAggregateBalance(address user) public override {
        Balance storage balance = userAggregateBalance[user];

        UserCommitment memory mostRecentCommit = userMostRecentCommit[user];

        uint256 _newLongTokens;
        uint256 _newShortTokens;
        uint256 _newSettlementTokens;
        uint256 _balanceLongBurnAmount;
        uint256 _balanceShortBurnAmount;

        /* If the update interval of mostRecentCommit has not yet passed, we still
           want to deduct burns from the balance from a user's balance.
           Therefore, this should happen outside of the if block below.*/
        _balanceLongBurnAmount = mostRecentCommit.balanceLongBurnAmount + mostRecentCommit.balanceLongBurnMintAmount;
        _balanceShortBurnAmount = mostRecentCommit.balanceShortBurnAmount + mostRecentCommit.balanceShortBurnMintAmount;
        if (mostRecentCommit.updateIntervalId != 0 && mostRecentCommit.updateIntervalId < updateIntervalId) {
            (_newLongTokens, _newShortTokens, _newSettlementTokens) = updateBalanceSingleCommitment(mostRecentCommit);
            delete userMostRecentCommit[user];
        } else {
            // Clear them now that they have been accounted for in the balance
            userMostRecentCommit[user].balanceLongBurnAmount = 0;
            userMostRecentCommit[user].balanceShortBurnAmount = 0;
            userMostRecentCommit[user].balanceLongBurnMintAmount = 0;
            userMostRecentCommit[user].balanceShortBurnMintAmount = 0;
        }

        UserCommitment memory nextIntervalCommit = userNextIntervalCommit[user];
        uint256 _newLongTokensSecond;
        uint256 _newShortTokensSecond;
        uint256 _newSettlementTokensSecond;

        _balanceLongBurnAmount +=
            nextIntervalCommit.balanceLongBurnAmount +
            nextIntervalCommit.balanceLongBurnMintAmount;
        _balanceShortBurnAmount +=
            nextIntervalCommit.balanceShortBurnAmount +
            nextIntervalCommit.balanceShortBurnMintAmount;
        if (nextIntervalCommit.updateIntervalId != 0 && nextIntervalCommit.updateIntervalId < updateIntervalId) {
            (_newLongTokensSecond, _newShortTokensSecond, _newSettlementTokensSecond) = updateBalanceSingleCommitment(
                nextIntervalCommit
            );
            delete userNextIntervalCommit[user];
        } else {
            // Clear them now that they have been accounted for in the balance
            userNextIntervalCommit[user].balanceLongBurnAmount = 0;
            userNextIntervalCommit[user].balanceShortBurnAmount = 0;
            userNextIntervalCommit[user].balanceLongBurnMintAmount = 0;
            userNextIntervalCommit[user].balanceShortBurnMintAmount = 0;
        }

        if (userMostRecentCommit[user].updateIntervalId == 0) {
            userMostRecentCommit[user] = userNextIntervalCommit[user];
            delete userNextIntervalCommit[user];
        }

        // Add new tokens minted, and remove the ones that were burnt from this balance
        balance.longTokens += _newLongTokens + _newLongTokensSecond;
        balance.longTokens -= _balanceLongBurnAmount;
        balance.shortTokens += _newShortTokens + _newShortTokensSecond;
        balance.shortTokens -= _balanceShortBurnAmount;
        balance.settlementTokens += _newSettlementTokens + _newSettlementTokensSecond;

        emit AggregateBalanceUpdated(user);
    }

    /**
     * @notice A copy of updateAggregateBalance that returns the aggregate balance without updating it
     */
    function getAggregateBalance(address user) public view override returns (Balance memory) {
        UserCommitment memory mostRecentCommit = userMostRecentCommit[user];
        Balance memory _balance = userAggregateBalance[user];

        uint256 _newLongTokens;
        uint256 _newShortTokens;
        uint256 _newSettlementTokens;
        uint256 _balanceLongBurnAmount;
        uint256 _balanceShortBurnAmount;

        /* If the update interval of mostRecentCommit has not yet passed, we still
           want to deduct burns from the balance from a user's balance.
           Therefore, this should happen outside of the if block below.*/
        _balanceLongBurnAmount = mostRecentCommit.balanceLongBurnAmount + mostRecentCommit.balanceLongBurnMintAmount;
        _balanceShortBurnAmount = mostRecentCommit.balanceShortBurnAmount + mostRecentCommit.balanceShortBurnMintAmount;
        if (mostRecentCommit.updateIntervalId != 0 && mostRecentCommit.updateIntervalId < updateIntervalId) {
            (_newLongTokens, _newShortTokens, _newSettlementTokens) = updateBalanceSingleCommitment(mostRecentCommit);
        }

        UserCommitment memory nextIntervalCommit = userNextIntervalCommit[user];
        uint256 _newLongTokensSecond;
        uint256 _newShortTokensSecond;
        uint256 _newSettlementTokensSecond;

        _balanceLongBurnAmount +=
            nextIntervalCommit.balanceLongBurnAmount +
            nextIntervalCommit.balanceLongBurnMintAmount;
        _balanceShortBurnAmount +=
            nextIntervalCommit.balanceShortBurnAmount +
            nextIntervalCommit.balanceShortBurnMintAmount;
        if (nextIntervalCommit.updateIntervalId != 0 && nextIntervalCommit.updateIntervalId < updateIntervalId) {
            (_newLongTokensSecond, _newShortTokensSecond, _newSettlementTokensSecond) = updateBalanceSingleCommitment(
                nextIntervalCommit
            );
        }

        // Add new tokens minted, and remove the ones that were burnt from this balance
        _balance.longTokens += _newLongTokens + _newLongTokensSecond;
        _balance.longTokens -= _balanceLongBurnAmount;
        _balance.shortTokens += _newShortTokens + _newShortTokensSecond;
        _balance.shortTokens -= _balanceShortBurnAmount;
        _balance.settlementTokens += _newSettlementTokens + _newSettlementTokensSecond;
        return _balance;
    }

    function setQuoteAndPool(address _quoteToken, address _leveragedPool) external override onlyFactory {
        require(_quoteToken != address(0), "Quote token address cannot be 0 address");
        require(_leveragedPool != address(0), "Leveraged pool address cannot be 0 address");
        leveragedPool = _leveragedPool;
        IERC20 _token = IERC20(_quoteToken);
        bool approvalSuccess = _token.approve(leveragedPool, _token.totalSupply());
        require(approvalSuccess, "ERC20 approval failed");
        tokens = ILeveragedPool(leveragedPool).poolTokens();
    }

    modifier updateBalance() {
        updateAggregateBalance(msg.sender);
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "Committer: not factory");
        _;
    }

    modifier onlyPool() {
        require(msg.sender == leveragedPool, "msg.sender not leveragedPool");
        _;
    }

    modifier onlySelf() {
        require(msg.sender == address(this), "msg.sender not self");
        _;
    }

    modifier onlyGov() {
        require(msg.sender == governance, "msg.sender not governance");
        _;
    }
}
