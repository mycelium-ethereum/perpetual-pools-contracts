// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "../interfaces/IPoolCommitter.sol";
import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPoolFactory.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./PoolSwapLibrary.sol";
import "../interfaces/IOracleWrapper.sol";

/// @title The pool controller contract
contract PoolCommitter is IPoolCommitter, Ownable {
    // #### Globals

    address public leveragedPool;
    // Index 0 is the LONG token, index 1 is the SHORT token.
    // Fetched from the LeveragedPool when leveragedPool is set
    address[2] public tokens;

    // MAX_UINT128
    uint128 public constant NO_COMMITS_REMAINING = type(uint128).max;
    uint128 public earliestCommitUnexecuted = NO_COMMITS_REMAINING;
    uint128 public latestCommitUnexecuted;
    uint128 public commitIDCounter;
    uint128 public minimumCommitSize; // The minimum amount (in settlement tokens) that a user can commit in a single commitment
    uint128 public maximumCommitQueueLength; // The maximum number of commitments that can be made for a given updateInterval
    uint128 public currentCommitQueueLength;
    uint256 public lastQueueLengthReset; // The time the queue length was last reset
    mapping(uint128 => Commit) public commits;
    mapping(uint256 => uint256) public shadowPools;

    address public factory;
    address public governance;

    enum ScanDirection {
        UP,
        DOWN
    }

    constructor(
        address _factory,
        uint128 _minimumCommitSize,
        uint128 _maximumCommitQueueLength
    ) {
        // set the factory on deploy
        factory = _factory;
        minimumCommitSize = _minimumCommitSize;
        maximumCommitQueueLength = _maximumCommitQueueLength;
        governance = IPoolFactory(factory).getOwner();
        lastQueueLengthReset = block.timestamp;
    }

    /**
     * @notice Commit to minting/burning long/short tokens after the next price change
     * @param commitType Type of commit you're doing (Long vs Short, Mint vs Burn)
     * @param amount Amount of quote tokens you want to commit to minting; OR amount of pool
     *               tokens you want to burn
     */
    function commit(CommitType commitType, uint256 amount) external override {
        require(currentCommitQueueLength < maximumCommitQueueLength, "Too many commits in interval");
        require(amount > 0, "Amount must not be zero");
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        uint256 updateInterval = pool.updateInterval();
        uint256 lastPriceTimestamp = pool.lastPriceTimestamp();
        uint256 frontRunningInterval = pool.frontRunningInterval();

        if (
            PoolSwapLibrary.isBeforeFrontRunningInterval(
                lastQueueLengthReset,
                lastPriceTimestamp,
                updateInterval,
                frontRunningInterval
            ) &&
            !PoolSwapLibrary.isBeforeFrontRunningInterval(
                block.timestamp,
                lastPriceTimestamp,
                updateInterval,
                frontRunningInterval
            )
        ) {
            /**
             * The lastQueueLengthReset occured before the frontRunningInterval,
             * and we are within the frontRunningInterval,
             * so this is the first commit since frontRunningInterval has passed.
             * Note: If and only if there are no `commit` calls within the frontRunningInterval, then
             * `executeAllCommitments` will reset `currentCommitQueueLength` and update
             * `lastQueueLengthReset`.
             */
            delete currentCommitQueueLength;
            lastQueueLengthReset = block.timestamp;
        }
        currentCommitQueueLength += 1;
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

        if (earliestCommitUnexecuted == NO_COMMITS_REMAINING) {
            earliestCommitUnexecuted = currentCommitIDCounter;
        }
        latestCommitUnexecuted = currentCommitIDCounter;

        emit CreateCommit(currentCommitIDCounter, amount, commitType);
        uint256 shortBalance = pool.shortBalance();
        uint256 longBalance = pool.longBalance();

        // pull in tokens
        if (commitType == CommitType.LongMint || commitType == CommitType.ShortMint) {
            // minting: pull in the quote token from the commiter
            require(amount >= minimumCommitSize, "Amount less than minimum");
            pool.quoteTokenTransferFrom(msg.sender, leveragedPool, amount);
        } else if (commitType == CommitType.LongBurn) {
            // long burning: pull in long pool tokens from commiter

            // A theoretical amount based on current ratio. Used to get same units as minimumCommitSize
            uint256 amountOut = PoolSwapLibrary.getBurnAmount(
                IERC20(tokens[0]).totalSupply(),
                amount,
                longBalance,
                shadowPools[_commitType]
            );
            require(amountOut >= minimumCommitSize, "Amount less than minimum");
            pool.burnTokens(0, amount, msg.sender);
        } else if (commitType == CommitType.ShortBurn) {
            // short burning: pull in short pool tokens from commiter

            // A theoretical amount based on current ratio. Used to get same units as minimumCommitSize
            uint256 amountOut = PoolSwapLibrary.getBurnAmount(
                IERC20(tokens[1]).totalSupply(),
                amount,
                shortBalance,
                shadowPools[_commitType]
            );
            require(amountOut >= minimumCommitSize, "Amount less than minimum");
            pool.burnTokens(1, amount, msg.sender);
        }
    }

    /**
     * @notice Uncommit to minting/burning long/short tokens before the frontrunning interval ticks over
     * @param _commitID ID of the commit to uncommit (contained within the commits mapping)
     */
    function uncommit(uint128 _commitID) external override {
        Commit memory _commit = commits[_commitID];
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        uint256 lastPriceTimestamp = pool.lastPriceTimestamp();
        uint256 frontRunningInterval = pool.frontRunningInterval();
        uint256 updateInterval = pool.updateInterval();
        require(
            PoolSwapLibrary.isBeforeFrontRunningInterval(
                block.timestamp,
                lastPriceTimestamp,
                updateInterval,
                frontRunningInterval
            ),
            "Must uncommit before frontRunningInterval"
        );
        require(msg.sender == _commit.owner, "Unauthorized");
        currentCommitQueueLength -= 1;
        _uncommit(_commit, _commitID);
    }

    /**
     * @dev When required, scan through the from earliestCommitUnexecuted to latestCommitUnexecuted
     *      and set these variables to be correct based on which of the commits between them are
     *      uncommited.
     *      This is useful for when you uncommit the first or last commit, and you can scan backwards or forwards
     *      in order to find the new value earliestCommitUnexecuted or latestCommitUnexecuted should be set to.
     * @param direction UP if going from earliest to latest, DOWN if going from latest to earliest.
     */
    function skipDeletedMiddleCommits(ScanDirection direction) internal {
        if (direction == ScanDirection.UP) {
            uint128 nextEarliestCommitUnexecuted = earliestCommitUnexecuted;
            while (nextEarliestCommitUnexecuted <= latestCommitUnexecuted) {
                IPoolCommitter.Commit memory _commit = commits[nextEarliestCommitUnexecuted];
                if (_commit.owner == address(0)) {
                    // Commit deleted (uncommitted) or already executed
                    nextEarliestCommitUnexecuted += 1; // It makes sense to set the next unexecuted to the next number
                    continue;
                } else {
                    break;
                }
            }
            if (nextEarliestCommitUnexecuted > latestCommitUnexecuted) {
                // We have just bumped earliestCommitUnexecuted above latestCommitUnexecuted,
                // we have therefore run out of commits
                earliestCommitUnexecuted = NO_COMMITS_REMAINING;
            } else {
                earliestCommitUnexecuted = nextEarliestCommitUnexecuted;
            }
        }

        if (direction == ScanDirection.DOWN) {
            uint128 nextLatestCommitUnexecuted = latestCommitUnexecuted;
            while (nextLatestCommitUnexecuted >= earliestCommitUnexecuted) {
                IPoolCommitter.Commit memory _commit = commits[nextLatestCommitUnexecuted];
                if (_commit.owner == address(0)) {
                    // Commit deleted (uncommitted) or already executed
                    nextLatestCommitUnexecuted -= 1;
                    continue;
                } else {
                    break;
                }
            }
            if (nextLatestCommitUnexecuted < earliestCommitUnexecuted) {
                // We have just bumped earliestCommitUnexecuted above latestCommitUnexecuted,
                // we have therefore run out of commits
                earliestCommitUnexecuted = NO_COMMITS_REMAINING;
            } else {
                latestCommitUnexecuted = nextLatestCommitUnexecuted;
            }
        }
    }

    function _uncommit(Commit memory _commit, uint128 _commitID) internal {
        // reduce pool commitment amount
        uint256 _commitType = uint256(_commit.commitType);
        shadowPools[_commitType] = shadowPools[_commitType] - _commit.amount;
        emit RemoveCommit(_commitID, _commit.amount, _commit.commitType);

        delete commits[_commitID];

        if (earliestCommitUnexecuted == _commitID) {
            // This is the first unexecuted commit, so we can bump this up one
            earliestCommitUnexecuted += 1;
            skipDeletedMiddleCommits(ScanDirection.UP);
        }
        if (latestCommitUnexecuted == _commitID && earliestCommitUnexecuted != NO_COMMITS_REMAINING) {
            // This is the latest commit unexecuted that we are trying to delete.
            latestCommitUnexecuted -= 1;
            skipDeletedMiddleCommits(ScanDirection.DOWN);
        }

        // release tokens
        if (_commit.commitType == CommitType.LongMint || _commit.commitType == CommitType.ShortMint) {
            // minting: return quote tokens to the commit owner
            ILeveragedPool(leveragedPool).quoteTokenTransfer(msg.sender, _commit.amount);
        } else if (_commit.commitType == CommitType.LongBurn) {
            // long burning: return long pool tokens to commit owner
            ILeveragedPool(leveragedPool).mintTokens(0, _commit.amount, msg.sender);
        } else if (_commit.commitType == CommitType.ShortBurn) {
            // short burning: return short pool tokens to the commit owner
            ILeveragedPool(leveragedPool).mintTokens(1, _commit.amount, msg.sender);
        }
    }

    /**
     * @notice Execute all the pending commits of a market
     */
    function executeAllCommitments() external override onlyPool {
        if (earliestCommitUnexecuted == NO_COMMITS_REMAINING) {
            return;
        }
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        uint256 frontRunningInterval = pool.frontRunningInterval();
        uint256 updateInterval = pool.updateInterval();
        uint256 lastPriceTimestamp = pool.lastPriceTimestamp();

        /**
         * If the queue length was reset before the frontRunningInterval that just passed, it means
         * there were no commitments during that frontRunningInterval, meaning we can reset queue length.
         */
        if (
            PoolSwapLibrary.isBeforeFrontRunningInterval(
                lastQueueLengthReset,
                lastPriceTimestamp,
                updateInterval,
                frontRunningInterval
            )
        ) {
            delete currentCommitQueueLength;
            lastQueueLengthReset = block.timestamp;
        }
        uint128 nextEarliestCommitUnexecuted;

        uint128 _latestCommitUnexecuted = latestCommitUnexecuted;
        for (
            nextEarliestCommitUnexecuted = earliestCommitUnexecuted;
            nextEarliestCommitUnexecuted <= _latestCommitUnexecuted;
            nextEarliestCommitUnexecuted++
        ) {
            IPoolCommitter.Commit memory _commit = commits[nextEarliestCommitUnexecuted];
            // These two checks are so a given call to executeCommitment won't revert,
            // allowing us to continue iterations, as well as update nextEarliestCommitUnexecuted.
            if (_commit.owner == address(0)) {
                // Commit deleted (uncommitted) or already executed
                continue;
            }
            if (block.timestamp - _commit.created <= frontRunningInterval) {
                // This commit is the first that was too late.
                break;
            }
            emit ExecuteCommit(nextEarliestCommitUnexecuted);
            try IPoolCommitter(address(this)).executeCommitment(_commit) {
                delete commits[nextEarliestCommitUnexecuted];
            } catch {
                _uncommit(_commit, nextEarliestCommitUnexecuted);
                emit FailedCommitExecution(nextEarliestCommitUnexecuted);
            }
            if (nextEarliestCommitUnexecuted == _latestCommitUnexecuted) {
                // We have reached the last one
                earliestCommitUnexecuted = NO_COMMITS_REMAINING;
                return;
            }
        }
        earliestCommitUnexecuted = nextEarliestCommitUnexecuted;
    }

    /**
     * @notice Executes a single commitment
     * @param _commit The commit to execute
     */
    function executeCommitment(Commit memory _commit) external override onlySelf {
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        uint256 shortBalance = pool.shortBalance();
        uint256 longBalance = pool.longBalance();
        uint256 _commitType = uint256(_commit.commitType);
        shadowPools[_commitType] = shadowPools[_commitType] - _commit.amount;
        if (_commit.commitType == CommitType.LongMint) {
            uint256 mintAmount = PoolSwapLibrary.getMintAmount(
                IERC20(tokens[0]).totalSupply(), // long token total supply,
                _commit.amount, // amount of quote tokens commited to enter
                longBalance, // total quote tokens in the long pull
                shadowPools[uint256(CommitType.LongBurn)] // total pool tokens commited to be burned
            );

            pool.mintTokens(0, mintAmount, _commit.owner);
            // update long and short balances
            pool.setNewPoolBalances(longBalance + _commit.amount, shortBalance);
        } else if (_commit.commitType == CommitType.LongBurn) {
            uint256 amountOut = PoolSwapLibrary.getBurnAmount(
                IERC20(tokens[0]).totalSupply(),
                _commit.amount,
                longBalance,
                shadowPools[_commitType] + _commit.amount
            );

            // update long and short balances
            pool.setNewPoolBalances(longBalance - amountOut, shortBalance);
            pool.quoteTokenTransfer(_commit.owner, amountOut);
        } else if (_commit.commitType == CommitType.ShortMint) {
            uint256 mintAmount = PoolSwapLibrary.getMintAmount(
                IERC20(tokens[1]).totalSupply(), // short token total supply
                _commit.amount,
                shortBalance,
                shadowPools[uint256(CommitType.ShortBurn)]
            );

            pool.mintTokens(1, mintAmount, _commit.owner);
            pool.setNewPoolBalances(longBalance, shortBalance + _commit.amount);
        } else if (_commit.commitType == CommitType.ShortBurn) {
            uint256 amountOut = PoolSwapLibrary.getBurnAmount(
                IERC20(tokens[1]).totalSupply(),
                _commit.amount,
                shortBalance,
                shadowPools[_commitType] + _commit.amount
            );

            // update long and short balances
            pool.setNewPoolBalances(longBalance, shortBalance - amountOut);
            pool.quoteTokenTransfer(_commit.owner, amountOut);
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
        _token.approve(leveragedPool, _token.totalSupply());
        tokens = ILeveragedPool(leveragedPool).poolTokens();
    }

    function setMinimumCommitSize(uint128 _minimumCommitSize) external override onlyGov {
        minimumCommitSize = _minimumCommitSize;
    }

    function setMaxCommitQueueLength(uint128 _maximumCommitQueueLength) external override onlyGov {
        require(_maximumCommitQueueLength > 0, "Commit queue must be > 0");
        maximumCommitQueueLength = _maximumCommitQueueLength;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "Commiter: not factory");
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
