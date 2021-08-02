// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolKeeper.sol";
import "../interfaces/IOracleWrapper.sol";
import "../interfaces/IPoolFactory.sol";
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
    @notice Format: Pool code => pool address, where pool code looks like TSLA/USD^5+aDAI
   */
  mapping(string => address) public pools;

  /**
  @notice Format: pool code => updateInterval => Upkeep details
   */
  mapping(string => mapping(uint32 => Upkeep)) public upkeep;
  /**
  @notice Format: Pool code => roundStart
   */
  mapping(string => uint256) public poolRoundStart;
  /**
  @notice Format: Pool code => executionPrice
   */
  mapping(string => int256) public executionPrice;
  /**
  @notice Format: Pool code => lastExecutionPrice
   */
  mapping(string => int256) public lastExecutionPrice;

  /**
  @notice Format: Pool code => timestamp of last price execution
  @dev Used to allow multiple upkeep registrations to use the same market/update interval price data.
   */
  mapping(string => uint256) public lastExecutionTime;

  PoolFactory public immutable factory;
  bytes16 constant fixedPoint = 0x403abc16d674ec800000000000000000; // 1 ether

  // #### Roles
  bytes32 public constant ADMIN = keccak256("ADMIN");

  // #### Functions
  constructor(address _factory) {
    require(_factory != address(0), "Factory cannot be 0 address");
    _setupRole(ADMIN, msg.sender);
    factory = PoolFactory(_factory);
  }

  /**
   * @notice When a pool is created, this function is called by the factory to initiate price tracking.
   * @param _poolCode The code associated with this pool.
   * @param _poolAddress The address of the newly-created pool.
   */
  function newPool(
    string memory _poolCode,
    address _poolAddress
  ) external override onlyFactory {
    require(address(pools[_poolCode]) == address(0), "Pre-existing pool code");
    IOracleWrapper oracleWrapper = IOracleWrapper(ILeveragedPool(_poolAddress).oracleWrapper());

    int256 firstPrice = oracleWrapper.getPrice();
    int256 startingPrice =
      ABDKMathQuad.toInt(
        ABDKMathQuad.mul(ABDKMathQuad.fromInt(firstPrice), fixedPoint)
      );
    emit PoolAdded(
      _poolAddress,
      firstPrice,
      _poolCode
    );
    poolRoundStart[_poolCode] = uint40(block.timestamp);
    executionPrice[_poolCode] = startingPrice;
    lastExecutionPrice[_poolCode] = startingPrice;
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
    for (uint256 i = 0; i < poolCodes.length; i++) {
      // Check trigger state
      IOracleWrapper wrapper = IOracleWrapper(ILeveragedPool(pools[poolCodes[i]]).oracleWrapper());
      int256 latestPrice = wrapper.getPrice();
      if (latestPrice != executionPrice[poolCodes[i]]) {
        // Upkeep required for price change or if the round hasn't been executed
        return (true, checkData);
      }
      
      // At least one pool needs updating
      if (lastExecutionTime[poolCodes[i]] < poolRoundStart[poolCodes[i]]) {
        return (true, checkData);
      }
    }
    return (false, checkData);
  }

  // TODO give performUpkeep pool code rather than market code
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

    for (uint256 i = 0; i < poolCodes.length; i++) {
      Upkeep memory upkeepData = upkeep[poolCodes[i]][updateInterval];

      ILeveragedPool pool = ILeveragedPool(pools[poolCodes[i]]);
      int256 latestPrice = IOracleWrapper(pool.oracleWrapper()).getPrice();
      if (
        pool.intervalPassed()
      ) {
        // Start a new round
        lastExecutionPrice[poolCodes[i]] = executionPrice[poolCodes[i]];
        executionPrice[poolCodes[i]] = latestPrice;
        poolRoundStart[poolCodes[i]] = block.timestamp;

        emit NewRound(
          lastExecutionPrice[poolCodes[i]],
          latestPrice,
          pool.updateInterval(),
          poolCodes[i]
        );

        _executePriceChange(
          uint32(block.timestamp),
          pool.updateInterval(),
          poolCodes[i],
          lastExecutionPrice[poolCodes[i]],
          latestPrice
        );
        return;
      }
      _executePriceChange(
        poolRoundStart[poolCodes[i]],
        pool.updateInterval(),
        poolCodes[i],
        upkeepData.lastExecutionPrice,
        upkeepData.executionPrice
      );
    }
  }

  /**
  @notice Executes a price change
  @param roundStart The start time of the round
  @param updateInterval The update interval of the pools
  @param poolCode The pool to update
  @param oldPrice The previously executed price
  @param latestPrice The price for the current interval
   */
  function _executePriceChange(
    uint256 roundStart,
    uint32 updateInterval,
    string memory poolCode,
    int256 oldPrice,
    int256 latestPrice
  ) internal {
    if (oldPrice > 0) { // TODO why is this check here?
      if (lastExecutionTime[poolCode] < roundStart) { // Make sure this round is after last execution time
        lastExecutionTime[poolCode] = uint40(block.timestamp);
        emit ExecutePriceChange(
          oldPrice,
          latestPrice,
          updateInterval,
          poolCode
        );
        // This allows us to still batch multiple calls to executePriceChange, even if some are invalid
        // Without reverting the entire transaction
        try
          LeveragedPool(pools[poolCode]).executePriceChange(
            oldPrice,
            latestPrice
          )
        {} catch Error(string memory reason) {
          emit PoolUpdateError(poolCode, reason);
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
    /*
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
    */
    string memory temp;
    string[] memory tempArray;
    return (true, 0, temp, tempArray);
  }

  // #### Modifiers
  modifier onlyAdmin {
    require(hasRole(ADMIN, msg.sender));
    _;
  }

  modifier onlyFactory {
    require(msg.sender == address(factory), "Caller not factory");
    _;
  }
}
