// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolKeeper.sol";
import "../interfaces/IOracleWrapper.sol";
import "../interfaces/IPoolFactory.sol";
import "../implementation/LeveragedPool.sol";
import "../vendors/SafeMath_40.sol";
import "../vendors/SafeMath_32.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "abdk-libraries-solidity/ABDKMathQuad.sol";

/*
 * @title The manager contract for multiple markets and the pools in them
 */
contract PoolKeeper is IPoolKeeper, Ownable {
    using SignedSafeMath for int256;
    using SafeMath_32 for uint32;
    using SafeMath_40 for uint40;

    // #### Global variables
    /**
     * @notice Format: Pool code => pool address, where pool code looks like TSLA/USD^5+aDAI
     */
    mapping(string => address) public pools;

    /**
     * @notice Format: Pool code => roundStart
     */
    mapping(string => uint256) public poolRoundStart;
    /**
     * @notice Format: Pool code => executionPrice
     */
    mapping(string => int256) public executionPrice;
    /**
     * @notice Format: Pool code => lastExecutionPrice
     */
    mapping(string => int256) public lastExecutionPrice;

    /**
     * @notice Format: Pool code => timestamp of last price execution
     * @dev Used to allow multiple upkeep registrations to use the same market/update interval price data.
     */
    mapping(string => uint256) public lastExecutionTime;

    IPoolFactory public factory;
    bytes16 constant fixedPoint = 0x403abc16d674ec800000000000000000; // 1 ether

    // #### Functions
    constructor(address _factory) {
        require(_factory != address(0), "Factory cannot be 0 address");
        factory = IPoolFactory(_factory);
    }

    /**
     * @notice When a pool is created, this function is called by the factory to initiate price tracking.
     * @param _poolCode The code associated with this pool.
     * @param _poolAddress The address of the newly-created pool.
     */
    function newPool(string memory _poolCode, address _poolAddress) external override onlyFactory {
        require(address(pools[_poolCode]) == address(0), "Pre-existing pool code");
        IOracleWrapper oracleWrapper = IOracleWrapper(ILeveragedPool(_poolAddress).oracleWrapper());
        pools[_poolCode] = _poolAddress;

        int256 firstPrice = oracleWrapper.getPrice();
        int256 startingPrice = ABDKMathQuad.toInt(ABDKMathQuad.mul(ABDKMathQuad.fromInt(firstPrice), fixedPoint));
        emit PoolAdded(_poolAddress, firstPrice, _poolCode);
        poolRoundStart[_poolCode] = uint40(block.timestamp);
        executionPrice[_poolCode] = startingPrice;
        lastExecutionPrice[_poolCode] = startingPrice;
    }

    // Keeper network
    /**
     * @notice Check if upkeep is required
     * @dev This should not be called or executed.
     * @param poolCode The poolCode of the pool to upkeep
     * @return upkeepNeeded Whether or not upkeep is needed for this single pool
     */
    function checkUpkeepSinglePool(string calldata poolCode) public view override returns (bool upkeepNeeded) {
        ILeveragedPool pool = ILeveragedPool(pools[poolCode]);
        if (pools[poolCode] == address(0)) {
            return false;
        }

        IOracleWrapper oracleWrapper = IOracleWrapper(pool.oracleWrapper());
        if (oracleWrapper.oracle() == address(0)) {
            return false;
        }
        int256 latestPrice = ABDKMathQuad.toInt(
            ABDKMathQuad.mul(ABDKMathQuad.fromInt(oracleWrapper.getPrice()), fixedPoint)
        );

        // The update interval has passed and the price has changed
        return (pool.intervalPassed() && latestPrice != executionPrice[poolCode]);
    }

    /**
     * @notice Checks multiple pools if any of them need updating
     * @param poolCodes The array of pool codes to check
     * @return upkeepNeeded Whether or not at least one pool needs upkeeping
     */
    function checkUpkeepMultiplePools(string[] calldata poolCodes) external view override returns (bool upkeepNeeded) {
        for (uint8 i = 0; i < poolCodes.length; i++) {
            if (checkUpkeepSinglePool(poolCodes[i])) {
                // One has been found that requires upkeeping
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Called by keepers to perform an update on a single pool
     * @param poolCode The pool code to perform the update for.
     */
    function performUpkeepSinglePool(string calldata poolCode) public override {
        if (!checkUpkeepSinglePool(poolCode)) {
            return;
        }
        ILeveragedPool pool = ILeveragedPool(pools[poolCode]);
        int256 latestPrice = IOracleWrapper(pool.oracleWrapper()).getPrice();
        // Start a new round
        lastExecutionPrice[poolCode] = executionPrice[poolCode];
        executionPrice[poolCode] = ABDKMathQuad.toInt(ABDKMathQuad.mul(ABDKMathQuad.fromInt(latestPrice), fixedPoint));
        poolRoundStart[poolCode] = block.timestamp;

        emit NewRound(lastExecutionPrice[poolCode], latestPrice, pool.updateInterval(), poolCode);

        _executePriceChange(
            uint32(block.timestamp),
            pool.updateInterval(),
            poolCode,
            lastExecutionPrice[poolCode],
            executionPrice[poolCode]
        );
    }

    /**
     * @notice Called by keepers to perform an update on multiple pools
     * @param poolCodes pool codes to perform the update for.
     */
    function performUpkeepMultiplePools(string[] calldata poolCodes) external override {
        for (uint256 i = 0; i < poolCodes.length; i++) {
            performUpkeepSinglePool(poolCodes[i]);
        }
    }

    /**
     * @notice Executes a price change
     * @param roundStart The start time of the round
     * @param updateInterval The update interval of the pools
     * @param poolCode The pool to update
     * @param oldPrice The previously executed price
     * @param latestPrice The price for the current interval
     */
    function _executePriceChange(
        uint256 roundStart,
        uint32 updateInterval,
        string memory poolCode,
        int256 oldPrice,
        int256 latestPrice
    ) internal {
        if (oldPrice > 0) {
            // TODO why is this check here?
            if (lastExecutionTime[poolCode] < roundStart) {
                // Make sure this round is after last execution time
                lastExecutionTime[poolCode] = uint40(block.timestamp);
                emit ExecutePriceChange(oldPrice, latestPrice, updateInterval, poolCode);
                // This allows us to still batch multiple calls to executePriceChange, even if some are invalid
                // Without reverting the entire transaction
                try LeveragedPool(pools[poolCode]).executePriceChange(oldPrice, latestPrice) {} catch Error(
                    string memory reason
                ) {
                    emit PoolUpdateError(poolCode, reason);
                }
            }
        }
    }

    function setFactory(address _factory) external override onlyOwner {
        factory = IPoolFactory(_factory);
    }

    modifier onlyFactory() {
        require(msg.sender == address(factory), "Caller not factory");
        _;
    }
}
