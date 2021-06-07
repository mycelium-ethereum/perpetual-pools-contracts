// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/ILeveragedPool.sol";
import "./PoolToken.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../vendors/SafeMath_112.sol";
import "./PoolSwapLibrary.sol";

/*
@title The pool controller contract
*/
contract LeveragedPool is ILeveragedPool, AccessControl, Initializable {
  using SafeMath for uint256;
  using SafeMath_112 for uint112;
  // #### Globals
  // TODO: Rearrange to tight pack these for gas savings
  string public poolCode;

  // Index 0 is the LONG token, index 1 is the SHORT token
  address[2] public tokens;

  // Each balance is the amount of quote tokens in the pair
  uint112 public shortBalance;
  uint112 public longBalance;

  uint32 public updateInterval;
  uint32 public frontRunningInterval;

  uint16 public fee;
  uint16 public leverageAmount;
  address public feeAddress;
  address public quoteToken;

  int256 public lastPrice;
  uint256 public lastPriceTimestamp;

  uint256 public commitIDCounter;
  mapping(uint256 => Commit) public commits;

  mapping(CommitType => uint112) public shadowPools;

  // #### Roles
  /**
  @notice The Updater role is for addresses that can update a pool's price
   */
  bytes32 public constant UPDATER = keccak256("UPDATER");
  /**
  @notice The admin role for the fee holder and updater roles
   */
  bytes32 public constant ADMIN = keccak256("ADMIN");

  /**
  @notice The Fee holder role is for addresses that can change the address that fees go to.
   */
  bytes32 public constant FEE_HOLDER = keccak256("FEE_HOLDER");

  // #### Functions

  function initialize(
    string memory _poolCode,
    int256 _firstPrice,
    uint32 _updateInterval,
    uint32 _frontRunningInterval,
    uint16 _fee,
    uint16 _leverageAmount,
    address _feeAddress,
    address _quoteToken
  ) external override initializer() {
    require(_feeAddress != address(0), "Fee address cannot be 0 address");
    require(_quoteToken != address(0), "Quote token cannot be 0 address");
    require(
      _updateInterval > _frontRunningInterval,
      "Update interval < FR interval"
    );
    // Setup roles
    _setRoleAdmin(UPDATER, ADMIN);
    _setRoleAdmin(FEE_HOLDER, ADMIN);
    _setupRole(UPDATER, msg.sender);
    _setupRole(ADMIN, msg.sender);
    _setupRole(FEE_HOLDER, _feeAddress);

    // Setup variables
    quoteToken = _quoteToken;
    lastPrice = _firstPrice;
    updateInterval = _updateInterval;
    frontRunningInterval = _frontRunningInterval;
    fee = _fee;
    leverageAmount = _leverageAmount;
    feeAddress = _feeAddress;
    lastPriceTimestamp = block.timestamp;
    poolCode = _poolCode;

    // Create pair tokens
    tokens[0] = address(
      new PoolToken(
        string(abi.encodePacked(_poolCode, "-LONG")),
        string(abi.encodePacked("L-", _poolCode))
      )
    );
    tokens[1] = address(
      new PoolToken(
        string(abi.encodePacked(_poolCode, "-SHORT")),
        string(abi.encodePacked("S-", _poolCode))
      )
    );
    emit PoolInitialized(tokens[0], tokens[1], _quoteToken, _poolCode);
  }

  function commit(
    CommitType commitType,
    bytes16 maxImbalance,
    uint112 amount
  ) external override {
    require(amount > 0, "Amount must not be zero");
    commitIDCounter = commitIDCounter.add(1);

    commits[commitIDCounter] = Commit({
      commitType: commitType,
      maxImbalance: maxImbalance,
      amount: amount,
      owner: msg.sender,
      created: block.timestamp
    });

    shadowPools[commitType] = shadowPools[commitType].add(amount);

    emit CreateCommit(commitIDCounter, amount, maxImbalance, commitType);

    if (
      commitType == CommitType.LongMint || commitType == CommitType.ShortMint
    ) {
      require(
        IERC20(quoteToken).transferFrom(msg.sender, address(this), amount),
        "Transfer failed"
      );
    } else if (commitType == CommitType.LongBurn) {
      require(PoolToken(tokens[0]).burn(amount, msg.sender), "Transfer failed");
    } else if (commitType == CommitType.ShortBurn) {
      require(PoolToken(tokens[1]).burn(amount, msg.sender), "Transfer failed");
    }
  }

  function uncommit(uint256 _commitID) external override {
    Commit memory _commit = commits[_commitID];
    require(msg.sender == _commit.owner, "Unauthorized");
    require(_commit.owner != address(0), "Invalid commit");

    shadowPools[_commit.commitType] -= _commit.amount;

    emit RemoveCommit(_commitID, _commit.amount, _commit.commitType);

    delete commits[_commitID];

    if (
      _commit.commitType == CommitType.LongMint ||
      _commit.commitType == CommitType.ShortMint
    ) {
      require(
        IERC20(quoteToken).transfer(msg.sender, _commit.amount),
        "Transfer failed"
      );
    } else if (_commit.commitType == CommitType.LongBurn) {
      require(
        PoolToken(tokens[0]).mint(_commit.amount, msg.sender),
        "Transfer failed"
      );
    } else if (_commit.commitType == CommitType.ShortBurn) {
      require(
        PoolToken(tokens[1]).mint(_commit.amount, msg.sender),
        "Transfer failed"
      );
    }
  }

  /**
  @notice Executes a single commitment.
  @param _commit The commit to execute
 */
  function _executeCommitment(Commit memory _commit) internal {
    // checks
    require(_commit.amount > 0, "Invalid commit");
    require(
      _commit.created.add(frontRunningInterval) < lastPriceTimestamp,
      "Commit too new"
    );
    require(
      PoolSwapLibrary.compareRatios(
        PoolSwapLibrary.getRatio(longBalance, shortBalance),
        _commit.maxImbalance
      ) <= 0,
      "Imbalance tolerance exceeded"
    );
    // effects
    shadowPools[_commit.commitType] = shadowPools[_commit.commitType].sub(
      _commit.amount
    );
    // interactions
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
      uint112 amountOut =
        PoolSwapLibrary.getAmountOut(
          PoolSwapLibrary.getRatio(
            longBalance,
            uint112(
              PoolToken(tokens[0])
                .totalSupply()
                .add(shadowPools[CommitType.LongBurn])
                .add(_commit.amount)
            )
          ),
          _commit.amount
        );
      longBalance = longBalance.sub(amountOut);
      require(
        IERC20(quoteToken).transfer(_commit.owner, amountOut),
        "Transfer failed"
      );
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
      uint112 amountOut =
        PoolSwapLibrary.getAmountOut(
          PoolSwapLibrary.getRatio(
            shortBalance,
            uint112(PoolToken(tokens[1]).totalSupply())
              .add(shadowPools[CommitType.ShortBurn])
              .add(_commit.amount)
          ),
          _commit.amount
        );

      shortBalance = shortBalance.sub(amountOut);
      require(
        IERC20(quoteToken).transfer(_commit.owner, amountOut),
        "Transfer failed"
      );
    }
  }

  /**
      @notice Mints new tokens
      @param token The token to mint
      @param amountIn The amount the user has committed to minting
      @param balance The balance of pair at the start of the execution
      @param inverseShadowbalance The amount of tokens burned from total supply
      @param owner The address to send the tokens to
   */
  function _mintTokens(
    address token,
    uint112 amountIn,
    uint112 balance,
    uint112 inverseShadowbalance,
    address owner
  ) internal {
    require(
      PoolToken(token).mint(
        PoolSwapLibrary.getAmountOut(
          PoolSwapLibrary.getRatio(
            uint112(PoolToken(token).totalSupply()).add(inverseShadowbalance),
            balance
          ),
          amountIn
        ),
        owner
      ),
      "Mint failed"
    );
  }

  function executeCommitment(uint256[] memory _commitIDs) external override {
    Commit memory _commit;
    for (uint256 i = 0; i < _commitIDs.length; i++) {
      _commit = commits[_commitIDs[i]];
      delete commits[_commitIDs[i]];
      emit ExecuteCommit(_commitIDs[i]);
      _executeCommitment(_commit);
    }
  }

  function executePriceChange(uint256 endPrice) external override {
    lastPriceTimestamp = block.timestamp;
  }

  function updateFeeAddress(address account) external override {}

  // #### Modifiers
  /**
    @notice Requires caller to have been granted the UPDATER role. Use this for functions that should be restricted to the PoolKeeper
     */
  modifier onlyUpdater {
    require(hasRole(UPDATER, msg.sender));
    _;
  }

  /** 
  @notice Requires caller to have been granted the FEE_HOLDER role.
  */
  modifier onlyFeeHolder {
    require(hasRole(FEE_HOLDER, msg.sender));
    _;
  }
}
