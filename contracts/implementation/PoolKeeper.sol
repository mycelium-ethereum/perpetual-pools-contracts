// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolKeeper.sol";
import "../interfaces/IOracleWrapper.sol";
import "../implementation/LeveragedPool.sol";

import "@chainlink/contracts/src/v0.7/interfaces/UpkeepInterface.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "hardhat/console.sol";

/*
@title The manager contract for multiple markets and the pools in them
*/
contract PoolKeeper is IPoolKeeper, AccessControl, UpkeepInterface {
  using SignedSafeMath for int256;
  using SafeMath for uint32;
  // #### Global variables
  /**
    @notice Format: Pool code => pool address, where pool code looks like TSLA/USD^5+aDAI
   */
  mapping(string => address) public override pools;

  /**
  @notice Format: market code => updateInterval => Upkeep details
   */
  mapping(string => mapping(uint256 => Upkeep)) public upkeep;
  /**
  @notice Format: Upkeep identifier (checkData) => timestamp of last price execution
  @dev Used to allow multiple upkeep registrations to use the same market/update interval price data.
   */
  mapping(bytes => uint32) public lastExecutionTime;

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
    _poolBase.initialize("BASE_POOL", 5, 2, 0, 0, address(this), address(this));
  }

  function triggerPriceUpdate(
    string memory marketCode,
    string[] memory poolCodes
  ) internal {}

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
    require(
      _updateInterval > _frontRunningInterval,
      "Update interval < FR interval"
    );

    LeveragedPool pool =
      LeveragedPool(
        Clones.cloneDeterministic(
          address(poolBase),
          keccak256(abi.encode(_poolCode))
        )
      );
    int256 firstPrice = oracle.getPrice(_marketCode);
    if (upkeep[_marketCode][_updateInterval].lastExecutionPrice == 0) {
      upkeep[_marketCode][_updateInterval] = Upkeep(
        firstPrice,
        firstPrice,
        firstPrice.mul(1000),
        firstPrice.mul(1000),
        1,
        _updateInterval,
        uint32(block.timestamp)
      );
    } else if (
      firstPrice != upkeep[_marketCode][_updateInterval].lastSamplePrice
    ) {
      upkeep[_marketCode][_updateInterval].cumulativePrice = upkeep[
        _marketCode
      ][_updateInterval]
        .cumulativePrice
        .add(firstPrice);
      upkeep[_marketCode][_updateInterval].count = uint32(
        upkeep[_marketCode][_updateInterval].count.add(1)
      );
    }
    emit CreatePool(address(pool), firstPrice, _updateInterval, _marketCode);

    pools[_poolCode] = address(pool);

    pool.initialize(
      _poolCode,
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
  @param checkData ABI encoded market code, pool codes, and update interval. There are two types of upkeep: market and pool. Market updates will manage the average price calculations, and pool updates will execute a price change in one or more pools
  @return upkeepNeeded Whether or not upkeep is needed
  @return performData The data to pass to the performUpkeep method when updating
   */
  function checkUpkeep(bytes calldata checkData)
    external
    view
    override
    returns (bool upkeepNeeded, bytes memory performData)
  {
    // Validate checkData
    (bool valid, uint32 updateInterval, string memory market, ) =
      _checkInputData(checkData);
    if (!valid) {
      return (false, new bytes(0));
    }
    // Check trigger state
    Upkeep memory upkeepData = upkeep[market][updateInterval];

    // TODO: Implement more sophisticated trigger states (delay for gas savings, etc)
    return (
      _validateUpkeep(
        market,
        upkeepData.lastSamplePrice,
        checkData,
        updateInterval
      ),
      checkData
    );
  }

  function _validateUpkeep(
    string memory market,
    int256 lastSamplePrice,
    bytes memory checkData,
    uint32 updateInterval
  ) internal view returns (bool) {
    int256 latestPrice = IOracleWrapper(oracleWrapper).getPrice(market);
    if (
      latestPrice != lastSamplePrice ||
      lastExecutionTime[checkData] <= upkeep[market][updateInterval].roundStart
    ) {
      // Upkeep required for price change or if the round hasn't been executed
      return true;
    }
    return false;
  }

  /**
  @notice Called by keepers to perform an update
  @param performData The upkeep data (market code, update interval, pool codes) to perform the update for.
   */
  function performUpkeep(bytes calldata performData) external override {
    (
      bool valid,
      uint32 updateInterval,
      string memory market,
      string[] memory poolCodes
    ) = _checkInputData(performData);
    if (!valid) {
      revert("Input data is invalid");
    }

    Upkeep memory upkeepData = upkeep[market][updateInterval];
    if (lastExecutionTime[performData] == 0) {
      console.log("Set last execution time");
      lastExecutionTime[performData] = upkeepData.roundStart;
    }
    if (
      block.timestamp >= upkeepData.roundStart.add(upkeepData.updateInterval)
    ) {
      // Start new round
      upkeep[market][upkeepData.updateInterval].executionPrice = _average(
        upkeepData.cumulativePrice,
        upkeepData.count
      );
      upkeep[market][upkeepData.updateInterval].lastExecutionPrice = upkeepData
        .executionPrice;
      upkeep[market][upkeepData.updateInterval].roundStart = uint32(
        block.timestamp
      );
      upkeep[market][upkeepData.updateInterval].count = 1;
      int256 price = IOracleWrapper(oracleWrapper).getPrice(market);
      upkeep[market][upkeepData.updateInterval].lastSamplePrice = price;
      upkeep[market][upkeepData.updateInterval].cumulativePrice = price;
      console.log("new round");
    } else if (
      _validateUpkeep(
        market,
        upkeepData.lastSamplePrice,
        performData,
        updateInterval
      )
    ) {
      // Add a sample
      upkeep[market][upkeepData.updateInterval].count = uint32(
        upkeep[market][upkeepData.updateInterval].count.add(1)
      );
      upkeep[market][upkeepData.updateInterval].cumulativePrice = upkeep[
        market
      ][upkeepData.updateInterval]
        .cumulativePrice
        .add(IOracleWrapper(oracleWrapper).getPrice(market));
      console.log("sample");
    }
    console.log(lastExecutionTime[performData], upkeepData.roundStart);
    if (lastExecutionTime[performData] <= upkeepData.roundStart) {
      console.log("Execute");
      // Execute this group using executionPrice and lastExecutionPrice from storage
      lastExecutionTime[performData] = uint32(block.timestamp);
      triggerPriceUpdate(market, poolCodes);
    }
  }

  /**
@notice Calculates the average price
@dev Calculates the price to 4 decimal places, round the last decimal place up or down before returning.
@param cumulative The cumulative price
@param count The number of samples
@return The average price to 3 decimal places
 */
  function _average(int256 cumulative, uint32 count)
    internal
    pure
    returns (int256)
  {
    return cumulative.mul(10000).div(count).add(5).div(10);
  }

  function _checkInputData(bytes calldata checkData)
    internal
    view
    returns (
      bool valid,
      uint32 updateInterval,
      string memory market,
      string[] memory poolCodes
    )
  {
    (uint32 updateInterval, string memory market, string[] memory poolGroup) =
      abi.decode(checkData, (uint32, string, string[]));
    IOracleWrapper oracle = IOracleWrapper(oracleWrapper);
    if (oracle.assetOracles(market) == address(0)) {
      return (false, updateInterval, market, poolGroup);
    }

    for (uint8 i = 0; i < poolGroup.length; i++) {
      if (pools[poolGroup[i]] == address(0)) {
        return (false, updateInterval, market, poolGroup);
      }
    }
    return (true, updateInterval, market, poolGroup);
  }

  // #### Modifiers
  modifier onlyAdmin {
    require(hasRole(ADMIN, msg.sender));
    _;
  }
}
