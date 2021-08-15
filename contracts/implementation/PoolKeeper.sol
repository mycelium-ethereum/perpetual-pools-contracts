// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "../interfaces/IPoolKeeper.sol";
import "../interfaces/IOracleWrapper.sol";
import "../interfaces/IPoolFactory.sol";
import "../interfaces/ILeveragedPool.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "abdk-libraries-solidity/ABDKMathQuad.sol";

/*
 * @title The manager contract for multiple markets and the pools in them
 */
contract PoolKeeper is IPoolKeeper, Ownable {
    /* Constants */
    uint256 public constant BASE_TIP = 1;
    uint256 public constant TIP_DELTA_PER_BLOCK = 1;

    // #### Global variables
    /**
     * @notice Format: Pool code => executionPrice
     */
    mapping(address => int256) public executionPrice;

    /**
     * @notice Format: Pool => timestamp of last price execution
     * @dev Used to allow multiple upkeep registrations to use the same market/update interval price data.
     */
    mapping(address => uint256) public lastExecutionBlock;

    mapping(address => uint256) public keeperFees;

    IPoolFactory public factory;
    bytes16 constant fixedPoint = 0x403abc16d674ec800000000000000000; // 1 ether

    // #### Functions
    constructor(address _factory) {
        require(_factory != address(0), "Factory cannot be 0 address");
        factory = IPoolFactory(_factory);
    }

    /**
     * @notice When a pool is created, this function is called by the factory to initiate price tracking.
     * @param _poolAddress The address of the newly-created pool.
     */
    function newPool(address _poolAddress) external override onlyFactory {
        address oracleWrapper = ILeveragedPool(_poolAddress).oracleWrapper();
        int256 firstPrice = IOracleWrapper(oracleWrapper).getPrice();
        int256 startingPrice = ABDKMathQuad.toInt(ABDKMathQuad.mul(ABDKMathQuad.fromInt(firstPrice), fixedPoint));
        emit PoolAdded(_poolAddress, firstPrice, _poolAddress);
        executionPrice[_poolAddress] = startingPrice;
        lastExecutionBlock[_poolAddress] = block.number;
    }

    // Keeper network
    /**
     * @notice Check if upkeep is required
     * @dev This should not be called or executed.
     * @param _pool The address of the pool to upkeep
     * @return upkeepNeeded Whether or not upkeep is needed for this single pool
     */
    function checkUpkeepSinglePool(address _pool) public view override returns (bool upkeepNeeded) {
        if (!factory.isValidPool(_pool)) {
            return false;
        }

        // The update interval has passed
        return ILeveragedPool(_pool).intervalPassed();
    }

    /**
     * @notice Checks multiple pools if any of them need updating
     * @param _pools The array of pools to check
     * @return upkeepNeeded Whether or not at least one pool needs upkeeping
     */
    function checkUpkeepMultiplePools(address[] calldata _pools) external view override returns (bool upkeepNeeded) {
        for (uint256 i = 0; i < _pools.length; i++) {
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
        uint256 startGas = gasleft();

        if (!checkUpkeepSinglePool(_pool)) {
            return;
        }
        ILeveragedPool pool = ILeveragedPool(_pool);
        int256 latestPrice = IOracleWrapper(pool.oracleWrapper()).getPrice();
        // Start a new round
        int256 lastExecutionPrice = executionPrice[_pool];
        executionPrice[_pool] = ABDKMathQuad.toInt(ABDKMathQuad.mul(ABDKMathQuad.fromInt(latestPrice), fixedPoint));

        emit NewRound(lastExecutionPrice, latestPrice, pool.updateInterval(), _pool);

        uint256 savedLastExecutionBlock = lastExecutionBlock[_pool];

        _executePriceChange(block.number, pool.updateInterval(), _pool, lastExecutionPrice, executionPrice[_pool]);

        uint256 gasSpent = startGas - gasleft();
        uint256 _gasPrice = 1; /* TODO: poll gas price oracle (or BASEFEE) */

        payKeeper(_pool, _gasPrice, gasSpent, savedLastExecutionBlock);
    }

    /**
     * @notice Pay keeper for upkeep
     * @param _pool Address of the given pool
     * @param _gasPrice Price of a single gas unit (in ETH)
     * @param _gasSpent Number of gas units spent
     */
    function payKeeper(
        address _pool,
        uint256 _gasPrice,
        uint256 _gasSpent,
        uint256 _executionBlock
    ) internal {
        uint256 reward = keeperReward(_pool, _gasPrice, _gasSpent, _executionBlock);

        keeperFees[msg.sender] += reward;
    }

    /**
     * @notice Called by keepers to perform an update on multiple pools
     * @param pools pool codes to perform the update for.
     */
    function performUpkeepMultiplePools(address[] calldata pools) external override {
        for (uint256 i = 0; i < pools.length; i++) {
            performUpkeepSinglePool(pools[i]);
        }
    }

    /**
     * @notice Executes a price change
     * @param roundStart The start block of the round
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
            if (lastExecutionBlock[pool] < roundStart) {
                // Make sure this round is after last execution time
                lastExecutionBlock[pool] = block.number;
                emit ExecutePriceChange(oldPrice, latestPrice, updateInterval, pool);
                // This allows us to still batch multiple calls to executePriceChange, even if some are invalid
                // Without reverting the entire transaction
                try ILeveragedPool(pool).poolUpkeep(oldPrice, latestPrice) {} catch Error(string memory reason) {
                    emit PoolUpdateError(pool, reason);
                }
            }
        }
    }

    /**
     * @notice Payment keeper receives for performing upkeep on a given pool
     * @param _pool Address of the given pool
     * @param _gasPrice Price of a single gas unit (in ETH)
     * @param _gasSpent Number of gas units spent
     * @return Keeper's reward
     */
    function keeperReward(
        address _pool,
        uint256 _gasPrice,
        uint256 _gasSpent,
        uint256 _executionBlock
    ) public view returns (uint256) {
        return keeperGas(_pool, _gasPrice, _gasSpent) + keeperTip(_pool, _executionBlock);
    }

    /**
     * @notice Compensation a keeper will receive for their gas expenditure
     * @param _pool Address of the given pool
     * @param _gasPrice Price of a single gas unit (in ETH)
     * @param _gasSpent Number of gas units spent
     * @return Keeper's gas compensation
     */
    function keeperGas(
        address _pool,
        uint256 _gasPrice,
        uint256 _gasSpent
    ) public view returns (uint256) {
        int256 settlementTokenPrice = IOracleWrapper(ILeveragedPool(_pool).keeperOracle()).getPrice();

        if (settlementTokenPrice <= 0) {
            return 0;
        } else {
            /* safe due to explicit bounds check above */
            return _gasPrice * _gasSpent * uint256(settlementTokenPrice);
        }
    }

    /**
     * @notice Tip a keeper will receive for successfully updating the specified pool
     * @param _pool Address of the given pool
     * @param _executionBlock The block in which the last execution took place
     * @return Keeper's tip
     */
    function keeperTip(address _pool, uint256 _executionBlock) public view returns (uint256) {
        /* the number of blocks that have elapsed since the given pool was last updated */
        uint256 elapsedBlocks = (_executionBlock - block.number);

        return BASE_TIP + TIP_DELTA_PER_BLOCK * elapsedBlocks;
    }

    function setFactory(address _factory) external override onlyOwner {
        factory = IPoolFactory(_factory);
    }

    modifier onlyFactory() {
        require(msg.sender == address(factory), "Caller not factory");
        _;
    }
}
