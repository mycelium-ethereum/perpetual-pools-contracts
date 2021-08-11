// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolCommitter.sol";
import "../interfaces/ILeveragedPool.sol";
import "./PoolToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../vendors/SafeMath_40.sol";
import "../vendors/SafeMath_112.sol";
import "../vendors/SafeMath_128.sol";

import "./PoolSwapLibrary.sol";
import "../interfaces/IOracleWrapper.sol";

/*
@title The pool controller contract
*/
contract PoolCommitter is IPoolCommitter, Ownable {
    using SafeMath_40 for uint40;
    using SafeMath_112 for uint112;
    using SafeMath_128 for uint128;

    // #### Globals

    // Index 0 is the LONG token, index 1 is the SHORT token
    address[2] public tokens;

    address public leveragedPool;

    // MAX_INT
    uint128 public constant NO_COMMITS_REMAINING = type(uint128).max;
    uint128 public earliestCommitUnexecuted = NO_COMMITS_REMAINING;
    uint128 public latestCommitUnexecuted;
    uint128 public commitIDCounter;
    mapping(uint128 => Commit) public commits;
    mapping(CommitType => uint112) public shadowPools;

    address public factory;

    constructor(address _factory) {
        // set the factory on deploy
        factory = _factory;
    }

    function commit(CommitType commitType, uint112 amount) external override {
        require(amount > 0, "Amount must not be zero");
        commitIDCounter = commitIDCounter.add(1);

        // create commitment
        commits[commitIDCounter] = Commit({
            commitType: commitType,
            amount: amount,
            owner: msg.sender,
            created: uint40(block.timestamp)
        });
        shadowPools[commitType] = shadowPools[commitType].add(amount);

        if (earliestCommitUnexecuted == NO_COMMITS_REMAINING) {
            earliestCommitUnexecuted = commitIDCounter;
        }
        latestCommitUnexecuted = commitIDCounter;

        emit CreateCommit(commitIDCounter, amount, commitType);

        // pull in tokens
        if (commitType == CommitType.LongMint || commitType == CommitType.ShortMint) {
            // minting: pull in the quote token from the commiter
            require(
                ILeveragedPool(leveragedPool).quoteTokenTransferFrom(msg.sender, address(this), amount),
                "Transfer failed"
            );
        } else if (commitType == CommitType.LongBurn) {
            // long burning: pull in long pool tokens from commiter
            ILeveragedPool(leveragedPool).burnTokens(0, amount, msg.sender);
        } else if (commitType == CommitType.ShortBurn) {
            // short burning: pull in short pool tokens from commiter
            ILeveragedPool(leveragedPool).burnTokens(1, amount, msg.sender);
        }
    }

    function uncommit(uint128 _commitID) external override {
        Commit memory _commit = commits[_commitID];
        require(msg.sender == _commit.owner, "Unauthorized");

        // reduce pool commitment amount
        shadowPools[_commit.commitType] = shadowPools[_commit.commitType].sub(_commit.amount);
        emit RemoveCommit(_commitID, _commit.amount, _commit.commitType);

        delete commits[_commitID];

        if (earliestCommitUnexecuted == _commitID) {
            // This is the first unexecuted commit, so we can bump this up one
            earliestCommitUnexecuted += 1;
        }
        if (earliestCommitUnexecuted > latestCommitUnexecuted) {
            // We have just bumped earliestCommitUnexecuted above latestCommitUnexecuted,
            // we have therefore run out of commits
            earliestCommitUnexecuted = NO_COMMITS_REMAINING;
        }
        if (latestCommitUnexecuted == _commitID && earliestCommitUnexecuted != NO_COMMITS_REMAINING) {
            // This is the latest commit unexecuted that we are trying to delete.
            latestCommitUnexecuted -= 1;
        }

        // release tokens
        if (_commit.commitType == CommitType.LongMint || _commit.commitType == CommitType.ShortMint) {
            // minting: return quote tokens to the commit owner
            require(
                ILeveragedPool(leveragedPool).quoteTokenTransferFrom(address(this), msg.sender, _commit.amount),
                "Transfer failed"
            );
        } else if (_commit.commitType == CommitType.LongBurn) {
            // long burning: return long pool tokens to commit owner
            ILeveragedPool(leveragedPool).burnTokens(0, _commit.amount, msg.sender);
        } else if (_commit.commitType == CommitType.ShortBurn) {
            // short burning: return short pool tokens to the commit owner
            ILeveragedPool(leveragedPool).burnTokens(1, _commit.amount, msg.sender);
        }
    }

    function executeAllCommitments() external override onlyPool {
        if (earliestCommitUnexecuted == NO_COMMITS_REMAINING) {
            return;
        }
        uint128 nextEarliestCommitUnexecuted;
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        uint256 frontRunningInterval = pool.frontRunningInterval();
        uint40 lastPriceTimestamp = pool.lastPriceTimestamp();
        for (uint128 i = earliestCommitUnexecuted; i <= latestCommitUnexecuted; i++) {
            IPoolCommitter.Commit memory _commit = commits[i];
            nextEarliestCommitUnexecuted = i;
            // These two checks are so a given call to _executeCommitment won't revert,
            // allowing us to continue iterations, as well as update nextEarliestCommitUnexecuted.
            if (_commit.owner == address(0)) {
                // Commit deleted (uncommitted) or already executed
                nextEarliestCommitUnexecuted += 1; // It makes sense to set the next unexecuted to the next number
                continue;
            }
            if (lastPriceTimestamp.sub(_commit.created) <= frontRunningInterval) {
                // This commit is the first that was too late.
                break;
            }
            emit ExecuteCommit(i);
            _executeCommitment(_commit);
            delete commits[i];
            if (i == latestCommitUnexecuted) {
                // We have reached the last one
                earliestCommitUnexecuted = NO_COMMITS_REMAINING;
                return;
            }
        }
        earliestCommitUnexecuted = nextEarliestCommitUnexecuted;
    }

    /**
     * @notice Executes a single commitment.
     * @param _commit The commit to execute
     */
    function _executeCommitment(Commit memory _commit) internal {
        require(_commit.owner != address(0), "Invalid commit");
        ILeveragedPool pool = ILeveragedPool(leveragedPool);
        uint40 lastPriceTimestamp = pool.lastPriceTimestamp();
        require(lastPriceTimestamp.sub(_commit.created) > pool.frontRunningInterval(), "Commit too new");
        uint112 shortBalance = pool.shortBalance();
        uint112 longBalance = pool.longBalance();
        shadowPools[_commit.commitType] = shadowPools[_commit.commitType].sub(_commit.amount);
        if (_commit.commitType == CommitType.LongMint) {
            pool.mintTokens(
                0, // long token
                _commit.amount, // amount of quote tokens commited to enter
                longBalance, // total quote tokens in the long pull
                shadowPools[CommitType.LongBurn], // total pool tokens commited to be burned
                _commit.owner
            );

            // update long and short balances
            pool.setNewPoolBalances(longBalance.add(_commit.amount), shortBalance);
        } else if (_commit.commitType == CommitType.LongBurn) {
            uint112 amountOut = PoolSwapLibrary.getAmountOut(
                PoolSwapLibrary.getRatio(
                    longBalance,
                    uint112(
                        uint112(PoolToken(pool.poolTokens()[0]).totalSupply())
                            .add(shadowPools[CommitType.LongBurn])
                            .add(_commit.amount)
                    )
                ),
                _commit.amount
            );

            // update long and short balances
            pool.setNewPoolBalances(longBalance.sub(amountOut), shortBalance);
            require(pool.quoteTokenTransferFrom(address(this), _commit.owner, amountOut), "Transfer failed");
        } else if (_commit.commitType == CommitType.ShortMint) {
            pool.mintTokens(
                1, // short token
                _commit.amount,
                shortBalance,
                shadowPools[CommitType.ShortBurn],
                _commit.owner
            );
            pool.setNewPoolBalances(longBalance, shortBalance.add(_commit.amount));
        } else if (_commit.commitType == CommitType.ShortBurn) {
            uint112 amountOut = PoolSwapLibrary.getAmountOut(
                PoolSwapLibrary.getRatio(
                    shortBalance,
                    uint112(PoolToken(pool.poolTokens()[1]).totalSupply()).add(shadowPools[CommitType.ShortBurn]).add(
                        _commit.amount
                    )
                ),
                _commit.amount
            );

            // update long and short balances
            pool.setNewPoolBalances(longBalance, shortBalance.sub(amountOut));
            require(pool.quoteTokenTransferFrom(address(this), _commit.owner, amountOut), "Transfer failed");
        }
    }

    /**
     * @return A Commit of a given ID
     */
    function getCommit(uint128 _commitID) public view override returns (Commit memory) {
        return commits[_commitID];
    }

    function setQuoteAndPool(address quoteToken, address _leveragedPool) external override onlyFactory {
        leveragedPool = _leveragedPool;
        IERC20 _token = IERC20(quoteToken);
        _token.approve(leveragedPool, _token.totalSupply());
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "Commiter: not factory");
        _;
    }

    modifier onlyPool() {
        require(msg.sender == leveragedPool, "msg.sender not leveragedPool");
        _;
    }
}
