// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "../interfaces/IPoolKeeper.sol";
import "../interfaces/IOracleWrapper.sol";
import "../interfaces/IPoolFactory.sol";
import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IERC20DecimalsWrapper.sol";
import "../interfaces/IERC20DecimalsWrapper.sol";
import "./PoolSwapLibrary.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "abdk-libraries-solidity/ABDKMathQuad.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV2V3Interface.sol";

/*
 * @title The manager contract for multiple markets and the pools in them
 */
contract PoolKeeper is IPoolKeeper, Ownable {
    /* Constants */
    uint256 public constant BASE_TIP = 5; // 5% base tip
    uint256 public constant TIP_DELTA_PER_BLOCK = 5; // 5% increase per block
    uint256 public constant BLOCK_TIME = 13; /* in seconds */
    uint256 public constant MAX_DECIMALS = 18;

    // #### Global variables
    /**
     * @notice Format: Pool address => last executionPrice
     */
    mapping(address => int256) public executionPrice;

    /**
     * @notice Format: Pool => timestamp of last price execution
     * @dev Used to allow multiple upkeep registrations to use the same market/update interval price data.
     */
    mapping(address => uint256) public lastExecutionTime;

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
        emit PoolAdded(_poolAddress, firstPrice);
        executionPrice[_poolAddress] = startingPrice;
        lastExecutionTime[_poolAddress] = block.timestamp;
    }

    // Keeper network
    /**
     * @notice Check if upkeep is required
     * @dev This should not be called or executed.
     * @param _pool The address of the pool to upkeep
     * @return upkeepNeeded Whether or not upkeep is needed for this single pool
     */
    function checkUpkeepSinglePool(address _pool) public view override returns (bool) {
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
    function checkUpkeepMultiplePools(address[] calldata _pools) external view override returns (bool) {
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

        uint256 savedPreviousUpdatedTimestamp = pool.lastPriceTimestamp();
        uint256 updateInterval = pool.updateInterval();

        _executePriceChange(block.timestamp, uint32(updateInterval), _pool, lastExecutionPrice, executionPrice[_pool]);

        uint256 gasSpent = startGas - gasleft();
        // TODO: poll gas price oracle (or BASEFEE)
        // _gasPrice = 10 gwei = 10000000000 wei
        uint256 _gasPrice = 10 gwei;

        payKeeper(_pool, _gasPrice, gasSpent, savedPreviousUpdatedTimestamp, updateInterval);
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
            if (lastExecutionTime[pool] < roundStart) {
                // Make sure this round is after last execution time
                lastExecutionTime[pool] = block.timestamp;
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
     * @notice Pay keeper for upkeep
     * @param _pool Address of the given pool
     * @param _gasPrice Price of a single gas unit (in ETH)
     * @param _gasSpent Number of gas units spent
     */
    function payKeeper(
        address _pool,
        uint256 _gasPrice,
        uint256 _gasSpent,
        uint256 _savedPreviousUpdatedTimestamp,
        uint256 _updateInterval
    ) internal {
        uint256 reward = keeperReward(_pool, _gasPrice, _gasSpent, _savedPreviousUpdatedTimestamp, _updateInterval);
        try ILeveragedPool(_pool).quoteTokenTransfer(msg.sender, reward) {
            emit KeeperPaid(_pool, msg.sender, reward);
        } catch Error(string memory reason) {
            // Usually occurs if pool just started and does not have any funds
            emit KeeperPaymentError(_pool, reason);
        }
    }

    /**
     * @notice Payment keeper receives for performing upkeep on a given pool
     * @param _pool Address of the given pool
     * @param _gasPrice Price of a single gas unit (in ETH)
     * @param _gasSpent Number of gas units spent
     * @return Number of settlement tokens to give to the keeper for work performed
     */
    function keeperReward(
        address _pool,
        uint256 _gasPrice,
        uint256 _gasSpent,
        uint256 _savedPreviousUpdatedTimestamp,
        uint256 _poolInterval
    ) public view returns (uint256) {
        // keeper gas cost in wei. WAD formatted
        uint256 _keeperGas = keeperGas(_pool, _gasPrice, _gasSpent);

        // tip percent in wad units
        bytes16 _tipPercent = ABDKMathQuad.mul(
            ABDKMathQuad.fromUInt(keeperTip(_savedPreviousUpdatedTimestamp, _poolInterval)),
            fixedPoint
        );
        // amount of settlement tokens to give to the keeper
        _tipPercent = ABDKMathQuad.div(_tipPercent, ABDKMathQuad.fromUInt(100));
        int256 wadRewardValue = ABDKMathQuad.toInt(
            ABDKMathQuad.add(
                ABDKMathQuad.fromUInt(_keeperGas),
                ABDKMathQuad.div((ABDKMathQuad.mul(ABDKMathQuad.fromUInt(_keeperGas), _tipPercent)), fixedPoint)
            )
        );
        uint256 decimals = IERC20DecimalsWrapper(ILeveragedPool(_pool).quoteToken()).decimals();
        uint256 deWadifiedReward = PoolSwapLibrary.fromWad(uint256(wadRewardValue), decimals);
        // _keeperGas + _keeperGas * percentTip
        return deWadifiedReward;
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
        int256 settlementTokenPrice = IOracleWrapper(ILeveragedPool(_pool).settlementEthOracle()).getPrice();

        if (settlementTokenPrice <= 0) {
            return 0;
        } else {
            /* safe due to explicit bounds check above */
            /* (wei * Settlement / ETH) / fixed point (10^18) = amount in settlement */
            bytes16 _weiSpent = ABDKMathQuad.fromUInt(_gasPrice * _gasSpent);
            bytes16 _settlementTokenPrice = ABDKMathQuad.fromUInt(uint256(settlementTokenPrice));
            return
                ABDKMathQuad.toUInt(ABDKMathQuad.div(ABDKMathQuad.mul(_weiSpent, _settlementTokenPrice), fixedPoint));
        }
    }

    /**
     * @notice Tip a keeper will receive for successfully updating the specified pool
     * @return percent of the `keeperGas` cost to add to payment, as a percent
     */
    function keeperTip(uint256 _savedPreviousUpdatedTimestamp, uint256 _poolInterval) public view returns (uint256) {
        /* the number of blocks that have elapsed since the given pool's updateInterval passed */
        uint256 elapsedBlocks = (block.timestamp - (_savedPreviousUpdatedTimestamp + _poolInterval)) / BLOCK_TIME;

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
