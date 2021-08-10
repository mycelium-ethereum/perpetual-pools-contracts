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

    // Each balance is the amount of quote tokens in the pair
    bytes16 public fee;
    bytes16 public leverageAmount;

    // Index 0 is the LONG token, index 1 is the SHORT token
    address[2] public tokens;

    address public leveragedPool;

    uint128 public commitIDCounter;
    mapping(uint128 => Commit) public commits;
    mapping(CommitType => uint112) public shadowPools;
    string public poolCode;

    address factory;

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
            require(PoolToken(tokens[0]).burn(amount, msg.sender), "Transfer failed");
        } else if (commitType == CommitType.ShortBurn) {
            // short burning: pull in short pool tokens from commiter
            require(PoolToken(tokens[1]).burn(amount, msg.sender), "Transfer failed");
        }
    }

    function uncommit(uint128 _commitID) external override {
        Commit memory _commit = commits[_commitID];
        require(msg.sender == _commit.owner, "Unauthorized");

        // reduce pool commitment amount
        shadowPools[_commit.commitType] = shadowPools[_commit.commitType].sub(_commit.amount);
        emit RemoveCommit(_commitID, _commit.amount, _commit.commitType);
        delete commits[_commitID];

        // release tokens
        if (_commit.commitType == CommitType.LongMint || _commit.commitType == CommitType.ShortMint) {
            // minting: return quote tokens to the commit owner
            require(
                ILeveragedPool(leveragedPool).quoteTokenTransferFrom(address(this), msg.sender, _commit.amount),
                "Transfer failed"
            );
        } else if (_commit.commitType == CommitType.LongBurn) {
            // long burning: return long pool tokens to commit owner
            require(PoolToken(tokens[0]).mint(_commit.amount, msg.sender), "Transfer failed");
        } else if (_commit.commitType == CommitType.ShortBurn) {
            // short burning: return short pool tokens to the commit owner
            require(PoolToken(tokens[1]).mint(_commit.amount, msg.sender), "Transfer failed");
        }
    }

    function executeCommitments(uint128[] calldata _commitIDs) external override {
        Commit memory _commit;
        for (uint128 i = 0; i < _commitIDs.length; i++) {
            _commit = commits[_commitIDs[i]];
            delete commits[_commitIDs[i]];
            emit ExecuteCommit(_commitIDs[i]);
            _executeCommitment(_commit);
        }
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
                        uint112(PoolToken(tokens[0]).totalSupply()).add(shadowPools[CommitType.LongBurn]).add(
                            _commit.amount
                        )
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
                    uint112(PoolToken(tokens[1]).totalSupply()).add(shadowPools[CommitType.ShortBurn]).add(
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
}
