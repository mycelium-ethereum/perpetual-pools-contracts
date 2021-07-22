// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolKeeper.sol";
import "../interfaces/IOracleWrapper.sol";
import "../implementation/LeveragedPool.sol";
import "../implementation/PoolFactory.sol";
import "../vendors/SafeMath_40.sol";
import "../vendors/SafeMath_32.sol";

import "@chainlink/contracts/src/v0.7/interfaces/UpkeepInterface.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "abdk-libraries-solidity/ABDKMathQuad.sol";

/*
@title The manager contract for multiple markets and the pools in them
*/
contract PoolKeeper is IPoolKeeper, AccessControl, UpkeepInterface {
  using SignedSafeMath for int256;
  using SafeMath_32 for uint32;
  using SafeMath_40 for uint40;

  // #### Global variables
  /**
  @notice Format: Pool Code => update interval => Market code. Used to prevent a pool from being updated with pricing from a market it doesn't belong to.
  */
  mapping(address => mapping(uint32 => string)) public poolMarkets;

  /**
  @notice Format: market code => updateInterval => Upkeep details
   */
  mapping(address => mapping(uint32 => Upkeep)) public upkeep;
  /**
  @notice Format: Pool code => timestamp of last price execution
  @dev Used to allow multiple upkeep registrations to use the same market/update interval price data.
   */
  mapping(address => uint40) public lastExecutionTime;

  address public oracleWrapper;

  PoolFactory public immutable factory;
  bytes16 constant fixedPoint = 0x403abc16d674ec800000000000000000; // 1 ether

  // #### Roles
  bytes32 public constant ADMIN = keccak256("ADMIN");

  // #### Functions
  constructor(address _oracleWrapper, address _factory) {
    require(_oracleWrapper != address(0), "Oracle cannot be 0 address");
    require(_factory != address(0), "Factory cannot be 0 address");
    oracleWrapper = _oracleWrapper;
    _setupRole(ADMIN, msg.sender);
    factory = PoolFactory(_factory);
  }

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
  ) external override returns (address) {
    IOracleWrapper oracle = IOracleWrapper(oracleWrapper);
    require(
      oracle.assetOracles(_marketCode) != address(0),
      "Market must exist first"
    );
    require(
      _updateInterval > _frontRunningInterval,
      "Update interval <= FR interval"
    );

    int256 firstPrice = oracle.getPrice(_marketCode);
    Upkeep memory upkeepData = upkeep[_marketCode][_updateInterval];
    if (upkeepData.lastExecutionPrice == 0) {
      int256 startingPrice =
        ABDKMathQuad.toInt(
          ABDKMathQuad.mul(ABDKMathQuad.fromInt(firstPrice), fixedPoint)
        );
      upkeep[_marketCode][_updateInterval] = Upkeep(
        firstPrice,
        firstPrice,
        startingPrice,
        startingPrice,
        1,
        _updateInterval,
        uint40(block.timestamp)
      );
    } else if (firstPrice != upkeepData.lastSamplePrice) {
      upkeep[_marketCode][_updateInterval].cumulativePrice = upkeepData
        .cumulativePrice
        .add(firstPrice);
      upkeep[_marketCode][_updateInterval].count = uint32(
        upkeepData.count.add(1)
      );
    }

    poolMarkets[_poolCode][_updateInterval] = _marketCode;
    emit CreatePool(
      Clones.predictDeterministicAddress(
        address(factory.poolBase()),
        keccak256(abi.encode(_poolCode)),
        address(factory)
      ),
      firstPrice,
      _updateInterval,
      _marketCode
    );
    
    address poolAddress = factory.deployPool(
      address(this),
      _poolCode,
      _frontRunningInterval,
      _fee,
      _leverageAmount,
      _feeAddress,
      _quoteToken
    );

    return poolAddress;
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
    (
      bool valid,
      uint32 updateInterval,
      string memory market,
      string[] memory poolCodes
    ) = _checkInputData(checkData);
    if (!valid) {
      return (false, new bytes(0));
    }
    // Check trigger state
    Upkeep memory upkeepData = upkeep[market][updateInterval];
    int256 latestPrice = IOracleWrapper(oracleWrapper).getPrice(market);
    if (latestPrice != upkeepData.lastSamplePrice) {
      // Upkeep required for price change or if the round hasn't been executed
      return (true, checkData);
    }
    for (uint256 i = 0; i < poolCodes.length; i++) {
      // At least one pool needs updating
      if (lastExecutionTime[poolCodes[i]] < upkeepData.roundStart) {
        return (true, checkData);
      }
    }
    return (false, checkData);
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

    int256 latestPrice = IOracleWrapper(oracleWrapper).getPrice(market);
    if (
      block.timestamp >=
      upkeepData.roundStart.add(uint40(upkeepData.updateInterval))
    ) {
      // Start new round
      int256 newPrice = _average(upkeepData.cumulativePrice, upkeepData.count);

      upkeep[market][updateInterval] = Upkeep(
        latestPrice,
        latestPrice,
        newPrice,
        upkeepData.executionPrice,
        1,
        upkeepData.updateInterval,
        uint40(block.timestamp)
      );

      emit NewRound(
        upkeepData.executionPrice,
        newPrice,
        upkeepData.updateInterval,
        market
      );

      _executePriceChange(
        uint32(block.timestamp),
        market,
        upkeepData.updateInterval,
        poolCodes,
        upkeepData.executionPrice,
        newPrice
      );
      return;
    } else if (latestPrice != upkeepData.lastSamplePrice) {
      // Add a sample
      int256 cumulative = upkeepData.cumulativePrice.add(latestPrice);
      uint32 count = uint32(upkeepData.count.add(1));
      upkeep[market][updateInterval] = Upkeep(
        cumulative,
        latestPrice,
        upkeepData.executionPrice,
        upkeepData.lastExecutionPrice,
        count,
        upkeepData.updateInterval,
        upkeepData.roundStart
      );

      emit PriceSample(cumulative, count, upkeepData.updateInterval, market);
    }
    _executePriceChange(
      upkeepData.roundStart,
      market,
      upkeepData.updateInterval,
      poolCodes,
      upkeepData.lastExecutionPrice,
      upkeepData.executionPrice
    );
  }

  /**
  @notice Executes a price change
  @param roundStart The start time of the round
  @param market The market the pools belong to 
  @param updateInterval The update interval of the pools
  @param poolCodes The pools to update
  @param oldPrice The previously executed price
  @param newPrice The price for the current interval
   */
  function _executePriceChange(
    uint40 roundStart,
    string memory market,
    uint32 updateInterval,
    string[] memory poolCodes,
    int256 oldPrice,
    int256 newPrice
  ) internal {
    if (oldPrice > 0) {
      for (uint8 i = 0; i < poolCodes.length; i++) {
        if (lastExecutionTime[poolCodes[i]] < roundStart) {
          lastExecutionTime[poolCodes[i]] = uint40(block.timestamp);
          emit ExecutePriceChange(
            oldPrice,
            newPrice,
            updateInterval,
            market,
            poolCodes[i]
          );
          try
            LeveragedPool(pools[poolCodes[i]]).executePriceChange(
              oldPrice,
              newPrice
            )
          {} catch Error(string memory reason) {
            emit PoolUpdateError(poolCodes[i], reason);
          }
        }
      }
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
    require(count > 0, "Count < 1");
    return
      ABDKMathQuad.toInt(
        ABDKMathQuad.div(
          ABDKMathQuad.mul(ABDKMathQuad.fromInt(cumulative), fixedPoint),
          ABDKMathQuad.fromInt(count)
        )
      );
  }

  /**
  @notice Checks input data for validity, making sure the market and pools are correct.
  @param checkData The input data to check. Should follow the same format as the checkUpkeep/performUpkeep methods.
  @return valid Whether the data is valid or not
  @return updateInterval The update interval for the pools
  @return market The market the pools belong to
  @return poolCodes The list of pools to upkeep.
   */
  function _checkInputData(bytes calldata checkData)
    internal
    view
    returns (
      bool,
      uint32,
      string memory,
      string[] memory
    )
  {
    (uint32 updateInterval, string memory market, string[] memory poolGroup) =
      abi.decode(checkData, (uint32, string, string[]));
    IOracleWrapper oracle = IOracleWrapper(oracleWrapper);
    if (oracle.assetOracles(market) == address(0)) {
      return (false, updateInterval, market, poolGroup);
    }

    for (uint8 i = 0; i < poolGroup.length; i++) {
      if (
        keccak256(
          abi.encodePacked(poolMarkets[poolGroup[i]][updateInterval])
        ) != keccak256(abi.encodePacked(market))
      ) {
        return (false, updateInterval, market, poolGroup);
      }
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
