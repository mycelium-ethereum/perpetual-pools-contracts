// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolKeeper.sol";
import "../interfaces/IOracleWrapper.sol";
import "../implementation/LeveragedPool.sol";

import "@chainlink/contracts/src/v0.7/interfaces/UpkeepInterface.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

/*
@title The manager contract for multiple markets and the pools in them
*/
contract PoolKeeper is IPoolKeeper, AccessControl, UpkeepInterface {
  // #### Global variables
  /**
    @notice Format: Pool code => pool address, where pool code looks like TSLA/USD^5+aDAI
   */
  mapping(string => address) public override pools;

  address public oracleWrapper;
  address public immutable override poolBase;

  // #### Roles
  /**
  @notice Use the Operator role to restrict access to the updateOracleWrapper function
   */
  bytes32 public constant OPERATOR = keccak256("OPERATOR");
  bytes32 public constant ADMIN = keccak256("ADMIN");

  // #### Functions
  constructor(address _oracleWrapper) {
    require(_oracleWrapper != address(0), "Oracle cannot be 0 address");
    oracleWrapper = _oracleWrapper;
    _setRoleAdmin(ADMIN, OPERATOR);
    _setupRole(ADMIN, msg.sender);
    _setupRole(OPERATOR, msg.sender);

    // Deploy pool base to share logic among pools
    LeveragedPool _poolBase = new LeveragedPool();
    poolBase = address(_poolBase);
    // Initialise the base contract so no one else abuses it.
    _poolBase.initialize(
      "BASE_POOL",
      1,
      5,
      2,
      0,
      0,
      address(this),
      address(this)
    );
  }

  function triggerPriceUpdate(
    string memory marketCode,
    string[] memory poolCodes
  ) external override {}

  function updateOracleWrapper(address oracle) external override onlyAdmin {
    require(oracle != address(0), "Oracle cannot be 0 address");
    oracleWrapper = oracle;
  }

  function createMarket(string memory marketCode, address oracle)
    external
    override
  {
    IOracleWrapper wrapper = IOracleWrapper(oracleWrapper);
    require(
      wrapper.assetOracles(marketCode) == address(0),
      "Pre-existing market code"
    );
    emit CreateMarket(marketCode, oracle);
    wrapper.setOracle(marketCode, oracle);
  }

  function createPool(
    string memory _marketCode,
    string memory _poolCode,
    uint32 _updateInterval,
    uint32 _frontRunningInterval,
    bytes16 _fee,
    uint16 _leverageAmount,
    address _feeAddress,
    address _quoteToken
  ) external override {
    require(address(pools[_poolCode]) == address(0), "Pre-existing pool code");
    IOracleWrapper oracle = IOracleWrapper(oracleWrapper);
    require(
      oracle.assetOracles(_marketCode) != address(0),
      "Market must exist first"
    );

    LeveragedPool pool =
      LeveragedPool(
        Clones.cloneDeterministic(
          address(poolBase),
          keccak256(abi.encode(_poolCode))
        )
      );
    int256 firstPrice = oracle.getPrice(_marketCode);
    emit CreatePool(address(pool), firstPrice);

    pools[_poolCode] = address(pool);

    pool.initialize(
      _poolCode,
      firstPrice,
      _updateInterval,
      _frontRunningInterval,
      _fee,
      _leverageAmount,
      _feeAddress,
      _quoteToken
    );
  }

  // Keeper network
  /**
  @notice Simulated by chainlink keeper nodes to check if upkeep is required
  @dev This should not be called or executed.
  @param checkData The ABI encoded market code to check if updating is required. There are two types of upkeep: market and pool. Market updates will manage the average price calculations, and pool updates will execute a price change in one or more pools
  @return upkeepNeeded Whether or not upkeep is needed
  @return performData The data to pass to the performUpkeep method when updating
   */
  function checkUpkeep(bytes calldata checkData)
    external
    view
    override
    returns (bool upkeepNeeded, bytes memory performData)
  {}

  /**
  @notice Called by keepers to perform an update
  @param performData The market code to perform the update for.
   */
  function performUpkeep(bytes calldata performData) external override {}

  // #### Modifiers
  modifier onlyAdmin {
    require(hasRole(ADMIN, msg.sender));
    _;
  }
}
