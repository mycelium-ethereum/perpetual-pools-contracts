// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/ILeveragedPool.sol";
import "./PoolToken.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/*
@title The pool controller contract
*/
contract LeveragedPool is ILeveragedPool, AccessControl, Initializable {
  // #### Globals
  // TODO: Rearrange to tight pack these for gas savings
  string public override poolCode;

  // Index 0 is the LONG token, index 1 is the SHORT token
  address[2] public override tokens;
  uint256 public shortBalance;
  uint256 public longBalance;

  int256 public override lastPrice;
  uint256 public override lastPriceTimestamp;

  address public override quoteToken;
  uint32 public override updateInterval;
  uint32 public override frontRunningInterval;

  uint16 public override fee;
  uint16 public override leverageAmount;
  address public override feeAddress;

  uint256 public override commitIDCounter;
  mapping(uint256 => Commit) public override commits;

  mapping(CommitType => uint256) public override shadowPools;

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
    uint256 maxImbalance,
    uint256 amount
  ) external override {
    require(amount > 0, "Amount must not be zero");
    commitIDCounter += 1;
    commits[commitIDCounter] = Commit({
      commitType: commitType,
      maxImbalance: maxImbalance,
      amount: amount,
      owner: msg.sender,
      created: block.timestamp
    });

    shadowPools[commitType] += amount;

    emit CreateCommit(commitIDCounter, amount, maxImbalance, commitType);

    if (
      commitType == CommitType.LongMint || commitType == CommitType.ShortMint
    ) {
      require(
        IERC20(quoteToken).transferFrom(msg.sender, address(this), amount),
        "Transfer of collateral failed"
      );
    }
    // TODO: finish implementation in TPS-9: executeCommitment
    // else if (commitType == CommitType.LongBurn) {
    //   require(
    //     IERC20(tokens[0]).transferFrom(msg.sender, address(this), amount),
    //     "Transfer of collateral failed"
    //   );
    // } else if (commitType == CommitType.ShortBurn) {
    //   require(
    //     IERC20(tokens[1]).transferFrom(msg.sender, address(this), amount),
    //     "Transfer of collateral failed"
    //   );
    // }
  }

  function uncommit(uint256 _commitID) external override {
    Commit memory _commit = commits[_commitID];
    require(msg.sender == _commit.owner, "Unauthorized");
    require(_commit.amount > 0, "Invalid commit");

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
    }
    // TODO: finish implementation in TPS-9: executeCommitment
    // else if (_commit.commitType == CommitType.LongBurn) {
    //   require(
    //     IERC20(tokens[0]).transfer(msg.sender, amount),
    //     "Transfer failed"
    //   );
    // } else if (_commit.commitType == CommitType.ShortBurn) {
    //   require(
    //     IERC20(tokens[1]).transfer(msg.sender, amount),
    //     "Transfer failed"
    //   );
    // }
  }

  function executeCommitment(uint256[] memory commitID) external override {}

  function executePriceChange(uint256 endPrice) external override {}

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
