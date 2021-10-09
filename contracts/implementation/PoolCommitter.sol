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

    // CommitType => Shadow pool amount
    // mapping(uint256 => uint256) public shadowPools;
    uint256[2] public shadowPools;
    // Address => User's commitment amounts in a given updateInterval
    mapping(address => Commitment) public userMostRecentCommit;
    // updateIntervalId => Total commitment amounts in a given updateInterval
    mapping(uint256 => Commitment) public totalMostRecentCommit;
    mapping(uint256 => Prices) priceHistory; // updateIntervalId => tokenPrice
    mapping(address => Balance) userAggregateBalance;

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

        // TODO aggregate commits or aggregate balance at start

        if (commitType == CommitType.LongMint || commitType == CommitType.ShortMint) {
            // minting: pull in the quote token from the committer
            pool.quoteTokenTransferFrom(msg.sender, leveragedPool, amount);
        }

        userMostRecentCommit[msg.sender].updateIntervalId = updateIntervalId;
        if (commitType == CommitType.LongMint) {
            userMostRecentCommit[msg.sender].longMintAmount += amount;
            totalMostRecentCommit[updateIntervalId].longMintAmount += amount;
        } else if (commitType == CommitType.LongBurn) {
            userMostRecentCommit[msg.sender].longBurnAmount += amount;
            totalMostRecentCommit[updateIntervalId].longBurnAmount += amount;
            // long burning: pull in long pool tokens from committer
            shadowPools[LONG_INDEX] += amount;
            pool.burnTokens(0, amount, msg.sender);
        } else if (commitType == CommitType.ShortMint) {
            userMostRecentCommit[msg.sender].shortMintAmount += amount;
            totalMostRecentCommit[updateIntervalId].shortMintAmount += amount;
        } else if (commitType == CommitType.ShortBurn) {
            userMostRecentCommit[msg.sender].shortBurnAmount += amount;
            totalMostRecentCommit[updateIntervalId].shortBurnAmount += amount;
            // short burning: pull in short pool tokens from committer
            shadowPools[SHORT_INDEX] += amount;
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

    function executeCommitments() external override onlyPool {
        Commitment memory _commits = totalMostRecentCommit[updateIntervalId];
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        uint256 shortBalance = pool.shortBalance();
        uint256 longBalance = pool.longBalance();
        uint256 longTotalSupplyBefore = IERC20(tokens[0]).totalSupply();
        uint256 shortTotalSupplyBefore = IERC20(tokens[1]).totalSupply();
        // TODO figure out shadow pool usage

        // Update price before values change
        priceHistory[updateIntervalId] = Prices({
            longPrice: PoolSwapLibrary.getPrice(longBalance, longTotalSupplyBefore + shadowPools[LONG_INDEX]),
            shortPrice: PoolSwapLibrary.getPrice(shortBalance, shortTotalSupplyBefore + shadowPools[SHORT_INDEX])
        });

        // Long Mints
        uint256 longMintAmount = PoolSwapLibrary.getMintAmount(
            longTotalSupplyBefore, // long token total supply,
            _commits.longMintAmount, // amount of quote tokens commited to enter
            longBalance, // total quote tokens in the long pull
            shadowPools[LONG_INDEX] // total pool tokens commited to be burned
        );
        pool.mintTokens(0, longMintAmount, leveragedPool);

        // Long Burns
        uint256 longBurnAmount = PoolSwapLibrary.getWithdrawAmountOnBurn(
            longTotalSupplyBefore,
            _commits.longBurnAmount,
            longBalance,
            shadowPools[LONG_INDEX]
        );

        // Short Mints
        uint256 shortMintAmount = PoolSwapLibrary.getMintAmount(
            shortTotalSupplyBefore, // short token total supply
            _commits.shortMintAmount,
            shortBalance,
            shadowPools[SHORT_INDEX]
        );

        pool.mintTokens(1, shortMintAmount, leveragedPool);

        // Short Burns
        uint256 shortBurnAmount = PoolSwapLibrary.getWithdrawAmountOnBurn(
            shortTotalSupplyBefore,
            _commits.shortBurnAmount,
            shortBalance,
            shadowPools[SHORT_INDEX]
        );

        uint256 newLongBalance = longBalance + _commits.longMintAmount - longBurnAmount;
        uint256 newShortBalance = shortBalance + _commits.shortMintAmount - shortBurnAmount;

        // TODO update user's aggregate balance
        // TODO setNewPoolBalances once at end
        // TODO only mint/burn if amount is > 0
        updateIntervalId += 1;

        shadowPools[LONG_INDEX] = 0;
        shadowPools[SHORT_INDEX] = 0;

        // Update the collateral on each side
        pool.setNewPoolBalances(newLongBalance, newShortBalance);
    }

    /**
     * @notice Add the result of a user's most recent commit to their aggregateBalance
     */
    function updateAggregateBalance(address user) public override {
        Commitment memory mostRecentCommit = userMostRecentCommit[user];
        if (mostRecentCommit.updateIntervalId == 0) {
            return;
        }
        Balance storage balance = userAggregateBalance[user];
        Prices memory prices = priceHistory[mostRecentCommit.updateIntervalId];
        uint256 longMintResult; // The amount of long tokens to mint based on settlement tokens deposited
        uint256 longBurnResult; // The amount of settlement tokens to withdraw based on long token burn
        uint256 shortMintResult; // The amount of short tokens to mint based on settlement tokens deposited
        uint256 shortBurnResult; // The amount of settlement tokens to withdraw based on short token burn
        if (mostRecentCommit.longMintAmount > 0) {
            longMintResult = PoolSwapLibrary.getMint(prices.longPrice, mostRecentCommit.longMintAmount);
        } else if (mostRecentCommit.longBurnAmount > 0) {
            longBurnResult = PoolSwapLibrary.getBurn(prices.longPrice, mostRecentCommit.longBurnAmount);
        } else if (mostRecentCommit.shortMintAmount > 0) {
            shortMintResult = PoolSwapLibrary.getMint(prices.shortPrice, mostRecentCommit.shortMintAmount);
        } else if (mostRecentCommit.shortBurnAmount > 0) {
            shortBurnResult = PoolSwapLibrary.getBurn(prices.shortPrice, mostRecentCommit.shortBurnAmount);
        }

        balance.longTokens += longMintResult;
        balance.shortTokens += shortMintResult;
        balance.settlementTokens += longBurnResult += shortBurnResult;

        delete userMostRecentCommit[user];

        emit AggregateBalanceUpdated(user);
    }

    /**
     * @notice A copy of updateAggregateBalance that returns the aggregate balance without updating it
     */
    function getAggregateBalance(address user)
        public
        view
        override
        returns (uint256 _longBalance, uint256 _shortBalance)
    {
        Balance memory balance = userAggregateBalance[user];
        Commitment memory mostRecentCommit = userMostRecentCommit[user];
        if (mostRecentCommit.updateIntervalId == 0) {
            return (balance.longTokens, balance.shortTokens);
        }
        Prices memory prices = priceHistory[mostRecentCommit.updateIntervalId];
        uint256 longMintResult;
        uint256 longBurnResult;
        uint256 shortMintResult;
        uint256 shortBurnResult;
        if (mostRecentCommit.longMintAmount > 0) {
            longMintResult = PoolSwapLibrary.getMint(prices.longPrice, mostRecentCommit.longMintAmount);
        } else if (mostRecentCommit.longBurnAmount > 0) {
            longBurnResult = PoolSwapLibrary.getBurn(prices.longPrice, mostRecentCommit.longBurnAmount);
        } else if (mostRecentCommit.shortMintAmount > 0) {
            shortMintResult = PoolSwapLibrary.getMint(prices.shortPrice, mostRecentCommit.shortMintAmount);
        } else if (mostRecentCommit.shortBurnAmount > 0) {
            shortBurnResult = PoolSwapLibrary.getBurn(prices.shortPrice, mostRecentCommit.shortBurnAmount);
        }

        _longBalance = balance.longTokens + longMintResult - longBurnResult;
        _shortBalance = balance.shortTokens += shortMintResult -= shortBurnResult;
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
