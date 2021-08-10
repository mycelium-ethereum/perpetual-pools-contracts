// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolCommittor.sol";
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
contract PoolCommittor is IPoolCommittor, Ownable {
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
    uint40 public lastPriceTimestamp;

    uint128 public commitIDCounter;
    mapping(uint128 => Commit) public commits;
    mapping(CommitType => uint112) public shadowPools;
    string public poolCode;

	constructor(address quoteToken) {
		// This contract will be telling LeveragedPool to transfer tokens
		IERC20(quoteToken).approve(leveragedPool, IERC20(quoteToken).totalSupply());
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
        	require(ILeveragedPool(leveragedPool).quoteTokenTransferFrom(msg.sender, address(this), amount), "Transfer failed");
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
        require(_commit.owner != address(0), "Invalid commit");

        // reduce pool commitment amount
        shadowPools[_commit.commitType] = shadowPools[_commit.commitType].sub(_commit.amount);
        emit RemoveCommit(_commitID, _commit.amount, _commit.commitType);
        delete commits[_commitID];

        // release tokens
        if (_commit.commitType == CommitType.LongMint || _commit.commitType == CommitType.ShortMint) {
            // minting: return quote tokens to the commit owner
        	require(ILeveragedPool(leveragedPool).quoteTokenTransferFrom(address(this), msg.sender, _commit.amount), "Transfer failed");
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
        require(lastPriceTimestamp.sub(_commit.created) > pool.frontRunningInterval(), "Commit too new");
        uint112 shortBalance = pool.shortBalance();
        uint112 longBalance = pool.longBalance();
        shadowPools[_commit.commitType] = shadowPools[_commit.commitType].sub(_commit.amount);
        if (_commit.commitType == CommitType.LongMint) {
            longBalance = longBalance.add(_commit.amount);
            _mintTokens(
                tokens[0],
                _commit.amount, // amount of quote tokens commited to enter
                longBalance.sub(_commit.amount), // total quote tokens in the long pull, excluding this mint
                shadowPools[CommitType.LongBurn], // total pool tokens commited to be burned
                _commit.owner
            );
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
            longBalance = longBalance.sub(amountOut);
        	require(pool.quoteTokenTransferFrom(address(this), _commit.owner, amountOut), "Transfer failed");
        } else if (_commit.commitType == CommitType.ShortMint) {
            shortBalance = shortBalance.add(_commit.amount);
            _mintTokens(
                tokens[1],
                _commit.amount,
                shortBalance.sub(_commit.amount),
                shadowPools[CommitType.ShortBurn],
                _commit.owner
            );
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

            shortBalance = shortBalance.sub(amountOut);
        	require(pool.quoteTokenTransferFrom(address(this), _commit.owner, amountOut), "Transfer failed");
            pool.setNewPoolBalances(longBalance, shortBalance);
        }
    }
    /**
     * @return A Commit of a given ID
     */
    function getCommit(uint128 _commitID) public view override returns (Commit memory) {
        return commits[_commitID];
    }

    function setLeveragedPool(address _leveragedPool) external override onlyOwner {
        leveragedPool = _leveragedPool;
    }

    /**
     * @notice Mints new tokens
     * @param token The token to mint
     * @param amountIn The amount the user has committed to minting
     * @param balance The balance of pair at the start of the execution
     * @param inverseShadowbalance The amount of tokens burned from total supply
     * @param tokenOwner The address to send the tokens to
     */
    function _mintTokens(
        address token,
        uint112 amountIn,
        uint112 balance,
        uint112 inverseShadowbalance,
        address tokenOwner
    ) internal {
        require(
            PoolToken(token).mint(
                // amount out = ratio * amount in
                PoolSwapLibrary.getAmountOut(
                    // ratio = (totalSupply + inverseShadowBalance) / balance
                    PoolSwapLibrary.getRatio(
                        uint112(PoolToken(token).totalSupply()).add(inverseShadowbalance),
                        balance
                    ),
                    amountIn
                ),
                tokenOwner
            ),
            "Mint failed"
        );
    }

}