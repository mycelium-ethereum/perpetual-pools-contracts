// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/ILeveragedPool.sol";
import "./PoolToken.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";

/*
@title The pool controller contract
*/
contract LeveragedPool is ILeveragedPool, AccessControl, Initializable {
  // #### Globals
  // TODO: Rearrange to tight pack these for gas savings
  address[2] public tokens;
  uint256 public shortBalance;
  uint256 public longBalance;

  int256 public lastPrice;
  uint256 public lastPriceTimestamp;

  address public quoteToken;
  uint32 public updateInterval;
  uint32 public frontRunningInterval;

  uint16 public fee;
  uint16 public leverageAmount;
  address public feeAddress;

  uint256 internal commitIDCounter;
  mapping(uint256 => Commit) public commits;

  uint256 public shadowLongBalance;
  uint256 public shadowShortBalance;

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
  /**
  @notice Configures the pool on deployment. The pools are EIP 1167 clones.
  @dev This can only be run once, and should only be run by the PoolKeeper that deployed it. 
  @param _poolCode The pool identification code. This is unique per pool per pool keeper
  @param _firstPrice The initial price of the asset that the pool tracks
  @param _updateInterval The frequency at which the pool will be updated
  @param _frontRunningInterval The minimum amount of time that must elapse before a commit can be executed. Must be smaller than the update interval to prevent deadlock
  @param _fee The fund movement fee. This amount is extracted from the deposited asset with every update and sent to the fee address.
  @param _leverageAmount The amount of exposure to price movements for the pool
  @param _feeAddress The address that the fund movement fee is sent to
  @param _quoteToken The digital asset that the pool accepts
 */
  function initialize(
    string memory _poolCode,
    int256 _firstPrice,
    uint32 _updateInterval,
    uint32 _frontRunningInterval,
    uint16 _fee,
    uint16 _leverageAmount,
    address _feeAddress,
    address _quoteToken
  ) public initializer {
    require(_feeAddress != address(0), "Fee address cannot be 0 address");
    require(_quoteToken != address(0), "Quote token cannot be 0 address");
    require(
      _updateInterval > _frontRunningInterval,
      "Update interval < FR interval"
    );
    // Setup roles
    _setupRole(UPDATER, msg.sender);
    _setupRole(ADMIN, msg.sender);
    _setRoleAdmin(UPDATER, ADMIN);
    _setRoleAdmin(FEE_HOLDER, ADMIN);

    // Setup variables
    quoteToken = _quoteToken;
    lastPrice = _firstPrice;
    updateInterval = _updateInterval;
    frontRunningInterval = _frontRunningInterval;
    fee = _fee;
    leverageAmount = _leverageAmount;
    feeAddress = _feeAddress;

    // tokens[0] = new PoolToken(
    //   abi.encodePacked(_poolCode, "-LONG"),
    //   abi.encodePacked("L-", _poolCode)
    // );
    // tokens[1] = new PoolToken(
    //   abi.encodePacked(_poolCode, "-SHORT"),
    //   string(abi.encodePacked("S-", _poolCode))
    // );
    // emit TokensCreated(tokens[0], tokens[1], _firstPrice, _quoteToken);
  }

  function commit(
    bytes2 commitType,
    uint256 maxImbalance,
    uint256 amount
  ) external override {}

  function uncommit(uint256 commitID) external override {}

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
