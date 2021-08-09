// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPoolToken.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../vendors/SafeMath_40.sol";
import "../vendors/SafeMath_112.sol";
import "../vendors/SafeMath_128.sol";

import "./PoolSwapLibrary.sol";
import "../interfaces/IOracleWrapper.sol";

/*
@title The pool controller contract
*/
contract LeveragedPool is ILeveragedPool, Initializable {
    using SafeMath_40 for uint40;
    using SafeMath_112 for uint112;
    using SafeMath_128 for uint128;

    // #### Globals

    // Each balance is the amount of quote tokens in the pair
    uint112 public shortBalance;
    uint112 public longBalance;
    uint32 public override frontRunningInterval;
    uint32 public override updateInterval;

    bytes16 public fee;
    bytes16 public leverageAmount;

    // Index 0 is the LONG token, index 1 is the SHORT token
    address[2] public tokens;

    address public owner;
    address public keeper;
    address public feeAddress;
    address public quoteToken;
    uint40 public override lastPriceTimestamp;

    // MAX_INT = 2**128 - 1 = 3.4028 * 10 ^ 38;
    //         = 340282366920938463463374607431768211455;
    uint128 public override constant NO_COMMITS_REMAINING = 340282366920938463463374607431768211455;
    uint128 public override earliestCommitUnexecuted;
    uint128 public override latestCommitUnexecuted;
    uint128 public commitIDCounter;
    mapping(uint128 => Commit) public commits;
    mapping(CommitType => uint112) public shadowPools;
    string public poolCode;
    address public override oracleWrapper;

    // #### Functions

    function initialize(ILeveragedPool.Initialization memory initialization) external override initializer {
        require(initialization._feeAddress != address(0), "Fee address cannot be 0 address");
        require(initialization._quoteToken != address(0), "Quote token cannot be 0 address");
        require(initialization._oracleWrapper != address(0), "Oracle wrapper cannot be 0 address");
        transferOwnershipInitializer(initialization._owner);

        // Setup variables
        keeper = initialization._keeper;
        oracleWrapper = initialization._oracleWrapper;
        quoteToken = initialization._quoteToken;
        frontRunningInterval = initialization._frontRunningInterval;
        updateInterval = initialization._updateInterval;
        fee = initialization._fee;
        leverageAmount = PoolSwapLibrary.convertUIntToDecimal(initialization._leverageAmount);
        feeAddress = initialization._feeAddress;
        lastPriceTimestamp = uint40(block.timestamp);
        poolCode = initialization._poolCode;
        tokens[0] = initialization._longToken;
        tokens[1] = initialization._shortToken;
        emit PoolInitialized(tokens[0], tokens[1], initialization._quoteToken, initialization._poolCode);
    }

    function commit(CommitType commitType, uint112 amount) external override {
        require(amount > 0, "Amount must not be zero");
        commitIDCounter = commitIDCounter.add(1);

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

        if (commitType == CommitType.LongMint || commitType == CommitType.ShortMint) {
            require(IERC20(quoteToken).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        } else if (commitType == CommitType.LongBurn) {
            require(IPoolToken(tokens[0]).burn(amount, msg.sender), "Transfer failed");
        } else if (commitType == CommitType.ShortBurn) {
            require(IPoolToken(tokens[1]).burn(amount, msg.sender), "Transfer failed");
        }
    }

    function uncommit(uint128 _commitID) external override {
        Commit memory _commit = commits[_commitID];
        require(msg.sender == _commit.owner, "Unauthorized");
        require(_commit.owner != address(0), "Invalid commit");

        shadowPools[_commit.commitType] -= _commit.amount;

        emit RemoveCommit(_commitID, _commit.amount, _commit.commitType);

        delete commits[_commitID];

        if (earliestCommitUnexecuted == _commitID) {
            earliestCommitUnexecuted += 1;
        }
        if (earliestCommitUnexecuted > latestCommitUnexecuted) {
            earliestCommitUnexecuted = NO_COMMITS_REMAINING;
        }
        if (latestCommitUnexecuted == _commitID && earliestCommitUnexecuted != NO_COMMITS_REMAINING) {
            latestCommitUnexecuted -= 1;
        }

        if (_commit.commitType == CommitType.LongMint || _commit.commitType == CommitType.ShortMint) {
            require(IERC20(quoteToken).transfer(msg.sender, _commit.amount), "Transfer failed");
        } else if (_commit.commitType == CommitType.LongBurn) {
            require(IPoolToken(tokens[0]).mint(_commit.amount, msg.sender), "Transfer failed");
        } else if (_commit.commitType == CommitType.ShortBurn) {
            require(IPoolToken(tokens[1]).mint(_commit.amount, msg.sender), "Transfer failed");
        }
    }

    /**
     * @notice Executes a single commitment.
     * @param _commit The commit to execute
     */
    function executeCommitment(Commit memory _commit) external override {
        require(_commit.owner != address(0), "Invalid commit");
        require(lastPriceTimestamp.sub(_commit.created) > frontRunningInterval, "Commit too new");
        shadowPools[_commit.commitType] = shadowPools[_commit.commitType].sub(_commit.amount);
        if (_commit.commitType == CommitType.LongMint) {
            longBalance = longBalance.add(_commit.amount);
            _mintTokens(
                tokens[0],
                _commit.amount,
                longBalance.sub(_commit.amount),
                shadowPools[CommitType.LongBurn],
                _commit.owner
            );
        } else if (_commit.commitType == CommitType.LongBurn) {
            uint112 amountOut = PoolSwapLibrary.getAmountOut(
                PoolSwapLibrary.getRatio(
                    longBalance,
                    uint112(
                        uint112(IPoolToken(tokens[0])._totalSupply()).add(shadowPools[CommitType.LongBurn]).add(
                            _commit.amount
                        )
                    )
                ),
                _commit.amount
            );
            longBalance = longBalance.sub(amountOut);
            require(IERC20(quoteToken).transfer(_commit.owner, amountOut), "Transfer failed");
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
                    uint112(IPoolToken(tokens[1])._totalSupply()).add(shadowPools[CommitType.ShortBurn]).add(
                        _commit.amount
                    )
                ),
                _commit.amount
            );

            shortBalance = shortBalance.sub(amountOut);
            require(IERC20(quoteToken).transfer(_commit.owner, amountOut), "Transfer failed");
        }
    }

    /**
     * @return The price of the pool's feed oracle
     */
    function getOraclePrice() public view override returns (int256) {
        return IOracleWrapper(oracleWrapper).getPrice();
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
            IPoolToken(token).mint(
                PoolSwapLibrary.getAmountOut(
                    PoolSwapLibrary.getRatio(
                        uint112(IPoolToken(token)._totalSupply()).add(inverseShadowbalance),
                        balance
                    ),
                    amountIn
                ),
                tokenOwner
            ),
            "Mint failed"
        );
    }

    /**
     * @notice Processes the effect of a price change. This involves transferring funds from the losing pool to the other.
     * @dev This function should be called by the Pool Keeper.
     * @dev This function should be secured with some form of access control
     * @param oldPrice The previously executed price
     * @param newPrice The price for the latest interval.
     */
    function executePriceChange(int256 oldPrice, int256 newPrice) external override onlyKeeper {
        require(intervalPassed(), "Update interval hasn't passed");
        (int8 direction, bytes16 lossMultiplier, uint112 totalFeeAmount) = PoolSwapLibrary
            .calculatePriceChangeParameters(oldPrice, newPrice, fee, longBalance, shortBalance, leverageAmount);

        if (direction >= 0 && shortBalance > 0) {
            // Move funds from short to long pair
            uint112 lossAmount = uint112(PoolSwapLibrary.getLossAmount(lossMultiplier, shortBalance));
            shortBalance = shortBalance.sub(lossAmount);
            longBalance = longBalance.add(lossAmount);
            emit PriceChange(oldPrice, newPrice, lossAmount);
        } else if (direction < 0 && longBalance > 0) {
            // Move funds from long to short pair
            uint112 lossAmount = uint112(PoolSwapLibrary.getLossAmount(lossMultiplier, longBalance));
            shortBalance = shortBalance.add(lossAmount);
            longBalance = longBalance.sub(lossAmount);
            emit PriceChange(oldPrice, newPrice, lossAmount);
        }
        lastPriceTimestamp = uint40(block.timestamp);
        require(IERC20(quoteToken).transfer(feeAddress, totalFeeAmount), "Fee transfer failed");
    }

    function getCommit(uint128 _commitID) external override returns (Commit memory) {
        return commits[_commitID];
    }

    /**
     * @notice Allow the PoolKeeper to update earliestCommitUnexecuted
     */
    function setEarliestCommitUnexecuted(uint128 _earliestCommitUnexecuted) external override onlyKeeper {
        earliestCommitUnexecuted = _earliestCommitUnexecuted;
    }

    /**
     * @return true if the price was last updated more than updateInterval seconds ago
     */
    function intervalPassed() public view override returns (bool) {
        return block.timestamp >= lastPriceTimestamp.add(updateInterval);
    }

    function updateFeeAddress(address account) external override onlyOwner {
        require(account != address(0), "Invalid address");
        feeAddress = account;
    }

    function setKeeper(address _keeper) external override onlyOwner {
        keeper = _keeper;
    }

    function transferOwnershipInitializer(address _owner) internal initializer {
        owner = _owner;
    }

    function transferOwnership(address _owner) external override onlyOwner {
        owner = _owner;
    }

    // #### Modifiers
    modifier onlyKeeper() {
        require(msg.sender == keeper, "msg.sender not keeper");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "msg.sender not owner");
        _;
    }
}
