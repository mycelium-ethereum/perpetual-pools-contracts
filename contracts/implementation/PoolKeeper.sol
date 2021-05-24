// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolKeeper.sol";
import "../interfaces/IOracleWrapper.sol";
import "../implementation/LeveragedPool.sol";

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

/*
@title The manager contract for multiple markets and the pools in them
*/
contract PoolKeeper is IPoolKeeper, AccessControl {
  // #### Global variables
  /**
    @notice Format: Pool code => pool address, where pool code looks like TSLA/USD^5+aDAI
   */
  mapping(bytes32 => LeveragedPool) public pools;

  address public oracleWrapper;
  LeveragedPool immutable poolBase;

  // #### Roles
  /**
  @notice Use the Operator role to restrict access to the updateOracleWrapper function
   */
  bytes32 public constant OPERATOR = keccak256("OPERATOR");
  bytes32 public constant ADMIN = keccak256("ADMIN");

  // #### Functions
  constructor(address _oracleWrapper) {
    oracleWrapper = _oracleWrapper;
    _setRoleAdmin(ADMIN, OPERATOR);
    _setupRole(ADMIN, msg.sender);
    _setupRole(OPERATOR, msg.sender);

    // Deploy pool base to share logic among pools
    LeveragedPool _poolBase = new LeveragedPool();
    // Initialise the base contract so no one else abuses it.
    _poolBase.initialize("BASE_POOL", 1, 5, 2, 0, 0, address(0), address(0));
    poolBase = _poolBase;
  }

  function triggerPriceUpdate(
    string memory marketCode,
    bytes32[] memory poolCodes
  ) external override {}

  function updateOracleWrapper(address oracle) external override onlyAdmin {
    oracleWrapper = oracle;
  }

  function createMarket(string memory marketCode, address oracle)
    external
    override
  {
    require(oracle != address(0), "Oracle cannot be 0 address");

    IOracleWrapper wrapper = IOracleWrapper(oracleWrapper);
    require(
      wrapper.assetOracles(marketCode) == address(0),
      "Pre-existing market code"
    );
    wrapper.setOracle(marketCode, oracle);
  }

  function createPool(
    string memory _marketCode,
    bytes32 _poolCode,
    uint32 _updateInterval,
    uint32 _frontRunningInterval,
    uint16 _fee,
    uint16 _leverageAmount,
    address _feeAddress,
    address _quoteToken
  ) external override {
    require(pools[_poolCode] == address(0), "Pre-existing pool code");
    require(feeAddress != address(0), "Fee address cannot be 0 address");
    require(quoteToken != address(0), "Quote token cannot be 0 address");
    require(
      _updateInterval > _frontRunningInterval,
      "Update interval < FR interval"
    );
    IOracleWrapper oracle = IOracleWrapper(oracleWrapper);
    require(
      oracle.assetOracles(_marketCode) != address(0),
      "Market must exist"
    );

    int256 firstPrice = oracle.getPrice(marketCode);

    LeveragedPool pool =
      Clones.cloneDeterministic(address(poolBase), _poolCode);

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

    pools[_poolCode] = pool;

    emit CreatePool(address(pool), firstPrice);
  }

  // #### Modifiers
  modifier onlyAdmin {
    require(hasRole(ADMIN, msg.sender));
    _;
  }
}
