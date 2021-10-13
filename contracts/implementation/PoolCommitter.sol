//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IPoolCommitter.sol";
import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPoolFactory.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./PoolSwapLibrary.sol";
import "../interfaces/IOracleWrapper.sol";

/// @title This contract is responsible for handling commitment logic
contract PoolCommitter is IPoolCommitter, Ownable {
    // #### Globals

    address public leveragedPool;
    uint128 public constant LONG_INDEX = 0;
    uint128 public constant SHORT_INDEX = 1;
    uint128 commitIDCounter;
    uint128 public updateIntervalId = 1;
    // Index 0 is the LONG token, index 1 is the SHORT token.
    // Fetched from the LeveragedPool when leveragedPool is set
    address[2] public tokens;

    // Address => User's commitment amounts in a given updateInterval
    mapping(address => Commitment) public userMostRecentCommit;
    mapping(address => Commitment) public userNextIntervalCommit;
    // Total commitment amounts in a given updateInterval
    Commitment public totalMostRecentCommit;
    Commitment public totalNextIntervalCommit;
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
     * @notice Commit to minting/burning long/short tokens after the next price change
     * @param commitType Type of commit you're doing (Long vs Short, Mint vs Burn)
     * @param amount Amount of quote tokens you want to commit to minting; OR amount of pool
     *               tokens you want to burn
     */
    function commit(CommitType commitType, uint256 amount) external override updateBalance {
        require(amount > 0, "Amount must not be zero");
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        uint256 updateInterval = pool.updateInterval();
        uint256 lastPriceTimestamp = pool.lastPriceTimestamp();
        uint256 frontRunningInterval = pool.frontRunningInterval();

        Commitment storage totalCommit;
        Commitment storage userCommit;

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
            pool.quoteTokenTransferFrom(msg.sender, leveragedPool, amount);
        }

        if (commitType == CommitType.LongMint) {
            userCommit.longMintAmount += amount;
            totalCommit.longMintAmount += amount;
        } else if (commitType == CommitType.LongBurn) {
            userCommit.longBurnAmount += amount;
            totalCommit.longBurnAmount += amount;
            // long burning: pull in long pool tokens from committer
            pool.burnTokens(0, amount, msg.sender);
        } else if (commitType == CommitType.ShortMint) {
            userCommit.shortMintAmount += amount;
            totalCommit.shortMintAmount += amount;
        } else if (commitType == CommitType.ShortBurn) {
            userCommit.shortBurnAmount += amount;
            totalCommit.shortBurnAmount += amount;
            // short burning: pull in short pool tokens from committer
            pool.burnTokens(1, amount, msg.sender);
        } else {
            // Not reachable
            revert("Invalid CommitType");
        }

        emit CreateCommit(amount, commitType);
    }

    function claim(address user) external override updateBalance {
        Balance memory balance = userAggregateBalance[user];
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        pool.quoteTokenTransfer(user, balance.settlementTokens);
        pool.poolTokenTransfer(LONG_INDEX, user, balance.longTokens);
        pool.poolTokenTransfer(SHORT_INDEX, user, balance.shortTokens);
        delete userAggregateBalance[user];
        emit Claim(user);
    }

    function executeGivenCommitments(Commitment memory _commits) internal {
        ILeveragedPool pool = ILeveragedPool(leveragedPool);

        uint256 shortBalance = pool.shortBalance();
        uint256 longBalance = pool.longBalance();
        uint256 longTotalSupplyBefore = IERC20(tokens[0]).totalSupply();
        uint256 shortTotalSupplyBefore = IERC20(tokens[1]).totalSupply();
        // TODO figure out shadow pool usage

        // Update price before values change
        priceHistory[updateIntervalId] = Prices({
            longPrice: PoolSwapLibrary.getPrice(longBalance, longTotalSupplyBefore + _commits.longBurnAmount),
            shortPrice: PoolSwapLibrary.getPrice(shortBalance, shortTotalSupplyBefore + _commits.shortBurnAmount)
        });

        // Long Mints
        uint256 longMintAmount = PoolSwapLibrary.getMintAmount(
            longTotalSupplyBefore, // long token total supply,
            _commits.longMintAmount, // amount of quote tokens commited to enter
            longBalance, // total quote tokens in the long pull
            _commits.longBurnAmount // total pool tokens commited to be burned
        );
        pool.mintTokens(0, longMintAmount, leveragedPool);

        // Long Burns
        uint256 longBurnAmount = PoolSwapLibrary.getWithdrawAmountOnBurn(
            longTotalSupplyBefore,
            _commits.longBurnAmount,
            longBalance,
            _commits.longBurnAmount
        );

        // Short Mints
        uint256 shortMintAmount = PoolSwapLibrary.getMintAmount(
            shortTotalSupplyBefore, // short token total supply
            _commits.shortMintAmount,
            shortBalance,
            _commits.shortBurnAmount
        );

        pool.mintTokens(1, shortMintAmount, leveragedPool);

        // Short Burns
        uint256 shortBurnAmount = PoolSwapLibrary.getWithdrawAmountOnBurn(
            shortTotalSupplyBefore,
            _commits.shortBurnAmount,
            shortBalance,
            _commits.shortBurnAmount
        );

        uint256 newLongBalance = longBalance + _commits.longMintAmount - longBurnAmount;
        uint256 newShortBalance = shortBalance + _commits.shortMintAmount - shortBurnAmount;

        // TODO update user's aggregate balance
        // TODO setNewPoolBalances once at end
        // TODO only mint/burn if amount is > 0
        updateIntervalId += 1;

        // Update the collateral on each side
        pool.setNewPoolBalances(newLongBalance, newShortBalance);
    }

    function executeCommitments() external override onlyPool {
        Commitment memory _commits = totalMostRecentCommit;
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

    function updateSingleCommitment(address user, Commitment memory commit)
        internal
        view
        returns (
            uint256 _newLongTokens,
            uint256 _newShortTokens,
            uint256 _newSettlementTokens
        )
    {
        PoolSwapLibrary.UpdateData memory updateData = PoolSwapLibrary.UpdateData({
            longPrice: priceHistory[commit.updateIntervalId].longPrice,
            shortPrice: priceHistory[commit.updateIntervalId].shortPrice,
            currentUpdateIntervalId: updateIntervalId,
            updateIntervalId: commit.updateIntervalId,
            longMintAmount: commit.longMintAmount,
            longBurnAmount: commit.longBurnAmount,
            shortMintAmount: commit.shortMintAmount,
            shortBurnAmount: commit.shortBurnAmount
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

        Commitment memory mostRecentCommit = userMostRecentCommit[user];

        uint256 _newLongTokens;
        uint256 _newShortTokens;
        uint256 _newSettlementTokens;

        if (mostRecentCommit.updateIntervalId != 0 && mostRecentCommit.updateIntervalId < updateIntervalId) {
            (_newLongTokens, _newShortTokens, _newSettlementTokens) = updateSingleCommitment(user, mostRecentCommit);
            delete userMostRecentCommit[user];
        }

        Commitment memory nextIntervalCommit = userNextIntervalCommit[user];
        uint256 _newLongTokensSecond;
        uint256 _newShortTokensSecond;
        uint256 _newSettlementTokensSecond;

        if (nextIntervalCommit.updateIntervalId != 0 && nextIntervalCommit.updateIntervalId < updateIntervalId) {
            (_newLongTokensSecond, _newShortTokensSecond, _newSettlementTokensSecond) = updateSingleCommitment(
                user,
                nextIntervalCommit
            );
            delete userNextIntervalCommit[user];
        }
        if (userMostRecentCommit[user].updateIntervalId == 0) {
            userMostRecentCommit[user] = userNextIntervalCommit[user];
            delete userNextIntervalCommit[user];
        }

        balance.longTokens += _newLongTokens += _newLongTokensSecond;
        balance.shortTokens += _newShortTokens += _newShortTokensSecond;
        balance.settlementTokens += _newSettlementTokens += _newSettlementTokensSecond;

        emit AggregateBalanceUpdated(user);
    }

    /**
     * @notice A copy of updateAggregateBalance that returns the aggregate balance without updating it
     */
    function getAggregateBalance(address user) public view override returns (Balance memory _balance) {
        Balance memory balance = userAggregateBalance[user];

        Commitment memory mostRecentCommit = userMostRecentCommit[user];

        uint256 _newLongTokens;
        uint256 _newShortTokens;
        uint256 _newSettlementTokens;

        if (mostRecentCommit.updateIntervalId != 0 && mostRecentCommit.updateIntervalId < updateIntervalId) {
            (_newLongTokens, _newShortTokens, _newSettlementTokens) = updateSingleCommitment(user, mostRecentCommit);
        }

        Commitment memory nextIntervalCommit = userNextIntervalCommit[user];
        uint256 _newLongTokensSecond;
        uint256 _newShortTokensSecond;
        uint256 _newSettlementTokensSecond;

        if (nextIntervalCommit.updateIntervalId != 0 && nextIntervalCommit.updateIntervalId < updateIntervalId) {
            (_newLongTokensSecond, _newShortTokensSecond, _newSettlementTokensSecond) = updateSingleCommitment(
                user,
                mostRecentCommit
            );
        }

        _balance.longTokens = balance.longTokens + _newLongTokens + _newLongTokensSecond;
        _balance.shortTokens = balance.shortTokens + _newShortTokens + _newShortTokensSecond;
        _balance.settlementTokens = balance.settlementTokens + _newSettlementTokens + _newSettlementTokensSecond;
    }

    function setQuoteAndPool(address _quoteToken, address _leveragedPool) external override onlyFactory {
        require(_quoteToken != address(0), "Quote token address cannot be 0 address");
        require(_leveragedPool != address(0), "Leveraged pool address cannot be 0 address");
        leveragedPool = _leveragedPool;
        IERC20 _token = IERC20(_quoteToken);
        bool approvalSuccess = _token.approve(leveragedPool, _token.totalSupply());
        require(approvalSuccess, "ERC20 approval failed");
        _token.approve(leveragedPool, _token.totalSupply());
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
