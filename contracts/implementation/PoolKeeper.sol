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

import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "abdk-libraries-solidity/ABDKMathQuad.sol";

/*
 * @title The manager contract for multiple markets and the pools in them
 */
contract PoolKeeper is IPoolKeeper, AccessControl {
    using SignedSafeMath for int256;
    using SafeMath_32 for uint32;
    using SafeMath_40 for uint40;

    // #### Global variables

    uint256 public numPools;

    /**
     * @notice Format: Pool counter => pool address, where pool code looks like TSLA/USD^5+aDAI
     */
    mapping(uint256 => address) public pools;

    /**
     * @notice Format: Pool code => roundStart
     */
    mapping(address => uint256) public poolRoundStart;
    /**
     * @notice Format: Pool code => executionPrice
     */
    mapping(address => int256) public executionPrice;
    /**
     * @notice Format: Pool code => lastExecutionPrice
     */
    mapping(address => int256) public lastExecutionPrice;

    /**
     * @notice Format: Pool code => timestamp of last price execution
     * @dev Used to allow multiple upkeep registrations to use the same market/update interval price data.
     */
    mapping(address => uint256) public lastExecutionTime;

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
    function newPool(string memory _poolCode, address _poolAddress) external override onlyFactory {
        IOracleWrapper oracleWrapper = IOracleWrapper(ILeveragedPool(_poolAddress).oracleWrapper());

        pools[numPools] = _poolAddress;
        numPools += 1;

        int256 firstPrice = oracleWrapper.getPrice();
        int256 startingPrice = ABDKMathQuad.toInt(ABDKMathQuad.mul(ABDKMathQuad.fromInt(firstPrice), fixedPoint));
        emit PoolAdded(_poolAddress, firstPrice, _poolAddress);
        poolRoundStart[_poolAddress] = uint40(block.timestamp);
        executionPrice[_poolAddress] = startingPrice;
        lastExecutionPrice[_poolAddress] = startingPrice;
    }

    // Keeper network
    /**
     * @notice Check if upkeep is required
     * @dev This should not be called or executed.
     * @param poolCode The poolCode of the pool to upkeep
     * @return upkeepNeeded Whether or not upkeep is needed for this single pool
     */
    function checkUpkeepSinglePool(address poolCode) public view override returns (bool upkeepNeeded) {
        ILeveragedPool pool = ILeveragedPool(poolCode);
        if (poolCode == address(0)) {
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
     * @param _pools The array of pool codes to check
     * @return upkeepNeeded Whether or not at least one pool needs upkeeping
     */
    function checkUpkeepMultiplePools(address[] calldata _pools) external view override returns (bool upkeepNeeded) {
        for (uint8 i = 0; i < _pools.length; i++) {
            if (checkUpkeepSinglePool(_pools[i])) {
                // One has been found that requires upkeeping
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Called by keepers to perform an update on a single pool
     * @param _pool The pool code to perform the update for.
     */
    function performUpkeepSinglePool(address _pool) public override {
        if (!checkUpkeepSinglePool(_pool)) {
            return;
        }
        ILeveragedPool pool = ILeveragedPool(_pool);
        int256 latestPrice = IOracleWrapper(pool.oracleWrapper()).getPrice();
        // Start a new round
        lastExecutionPrice[_pool] = executionPrice[_pool];
        executionPrice[_pool] = ABDKMathQuad.toInt(ABDKMathQuad.mul(ABDKMathQuad.fromInt(latestPrice), fixedPoint));
        poolRoundStart[_pool] = block.timestamp;

        emit NewRound(lastExecutionPrice[_pool], latestPrice, pool.updateInterval(), _pool);

        _executePriceChange(
            uint32(block.timestamp),
            pool.updateInterval(),
            _pool,
            lastExecutionPrice[_pool],
            executionPrice[_pool]
        );
    }

    /**
     * @notice Called by keepers to perform an update on multiple pools
     * @param poolCodes pool codes to perform the update for.
     */
    function performUpkeepMultiplePools(address[] calldata poolCodes) external override {
        for (uint256 i = 0; i < poolCodes.length; i++) {
            performUpkeepSinglePool(poolCodes[i]);
        }
    }

    /**
     * @notice Executes a price change
     * @param roundStart The start time of the round
     * @param updateInterval The update interval of the pools
     * @param pool The pool to update
     * @param oldPrice The previously executed price
     * @param latestPrice The price for the current interval
     */
    function _executePriceChange(
        uint256 roundStart,
        uint32 updateInterval,
        address pool,
        int256 oldPrice,
        int256 latestPrice
    ) internal {
        if (oldPrice > 0) {
            // TODO why is this check here?
            if (lastExecutionTime[pool] < roundStart) {
                // Make sure this round is after last execution time
                lastExecutionTime[pool] = uint40(block.timestamp);
                emit ExecutePriceChange(oldPrice, latestPrice, updateInterval, pool);
                // This allows us to still batch multiple calls to executePriceChange, even if some are invalid
                // Without reverting the entire transaction
                try LeveragedPool(pool).executePriceChange(oldPrice, latestPrice) {} catch Error(string memory reason) {
                    emit PoolUpdateError(pool, reason);
                }
            }
        }
    }

    // #### Modifiers
    modifier onlyAdmin() {
        require(hasRole(ADMIN, msg.sender));
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == address(factory), "Caller not factory");
        _;
    }
}
