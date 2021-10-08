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
    uint128 commitIDCounter;
    // Index 0 is the LONG token, index 1 is the SHORT token.
    // Fetched from the LeveragedPool when leveragedPool is set
    address[2] public tokens;

    mapping(uint128 => Commit) public commits;
    mapping(uint256 => uint256) public shadowPools;

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
    function commit(CommitType commitType, uint256 amount) external override {
        require(amount > 0, "Amount must not be zero");
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        uint256 updateInterval = pool.updateInterval();
        uint256 lastPriceTimestamp = pool.lastPriceTimestamp();
        uint256 frontRunningInterval = pool.frontRunningInterval();

        if (
            !PoolSwapLibrary.isBeforeFrontRunningInterval(
                block.timestamp,
                lastPriceTimestamp,
                updateInterval,
                frontRunningInterval
            )
        ) {}
        uint128 currentCommitIDCounter = commitIDCounter;
        commitIDCounter = currentCommitIDCounter + 1;

        // create commitment
        commits[currentCommitIDCounter] = Commit({
            commitType: commitType,
            amount: amount,
            owner: msg.sender,
            created: uint40(block.timestamp)
        });
        uint256 _commitType = uint256(commitType);
        shadowPools[_commitType] = shadowPools[_commitType] + amount;

        emit CreateCommit(currentCommitIDCounter, amount, commitType);

        // pull in tokens
        if (commitType == CommitType.LongMint || commitType == CommitType.ShortMint) {
            // minting: pull in the quote token from the committer
            pool.quoteTokenTransferFrom(msg.sender, leveragedPool, amount);
        } else if (commitType == CommitType.LongBurn) {
            // long burning: pull in long pool tokens from committer
            pool.burnTokens(0, amount, msg.sender);
        } else if (commitType == CommitType.ShortBurn) {
            // short burning: pull in short pool tokens from committer
            pool.burnTokens(1, amount, msg.sender);
        }
    }

    /**
     * @return A Commit of a given ID
     */
    function getCommit(uint128 _commitID) external view override returns (Commit memory) {
        return commits[_commitID];
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
