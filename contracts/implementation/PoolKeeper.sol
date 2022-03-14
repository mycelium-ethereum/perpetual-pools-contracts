//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IPoolKeeper.sol";
import "../interfaces/IOracleWrapper.sol";
import "../interfaces/IPoolFactory.sol";
import "../implementation/PriceObserver.sol";
import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IERC20DecimalsWrapper.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "abdk-libraries-solidity/ABDKMathQuad.sol";

/// @title The manager contract for multiple markets and the pools in them
/// @dev Currently, this contract estimates the best keeper rewards in a way that is best suited for Ethereum L1.
/// @dev It assumes an approximate block time of 13 seconds, and an Ethereum-like gas system.
/// @dev This code was also written with Arbitrum deployment in mind, meaning there exists no `block.basefee`, and no arbitrum gas price oracle.
/// @dev It has another large drawback in that it is not possible to calculate the cost of the current transaction Arbitrum, given that the cost is largely determined by L1 calldata cost.
/// @dev Because of this, the reward calculation is an rough "good enough" estimation.
contract PoolKeeper is IPoolKeeper, Ownable {
    /* Constants */
    uint256 public constant BASE_TIP = 5; // 5% base tip
    uint256 public constant TIP_DELTA_PER_BLOCK = 5; // 5% increase per block
    uint256 public constant BLOCK_TIME = 13; /* in seconds */
    uint256 public constant MAX_TIP = 100; /* maximum keeper tip */
    bytes16 public constant FIXED_POINT = 0x403abc16d674ec800000000000000000; // 1 ether

    /// Captures fixed gas overhead for performing upkeep that's unreachable
    /// by `gasleft()` due to our approach to error handling in that code
    uint256 public constant FIXED_GAS_OVERHEAD = 80195;

    // #### Global variables
    /**
     * @notice Format: Pool address => last executionPrice
     */
    mapping(address => int256) public executionPrice;

    IPoolFactory public immutable factory;

    uint256 public gasPrice = 10 gwei;

    /**
     * @notice Ensures that the caller is the associated `PoolFactory` contract
     */
    modifier onlyFactory() {
        require(msg.sender == address(factory), "Caller not factory");
        _;
    }

    // #### Functions
    constructor(address _factory) {
        require(_factory != address(0), "Factory cannot be 0 address");
        factory = IPoolFactory(_factory);
    }

    /**
     * @notice When a pool is created, this function is called by the factory to initiate price trackings
     * @param _poolAddress The address of the newly-created pools
     * @dev Only callable by the associated `PoolFactory` contract
     */
    function newPool(address _poolAddress) external override onlyFactory {
        int256 firstPrice = ILeveragedPool(_poolAddress).getOraclePrice();
        require(firstPrice > 0, "First price is non-positive");
        emit PoolAdded(_poolAddress, firstPrice);
        executionPrice[_poolAddress] = firstPrice;
    }

    /**
     * @notice Check if upkeep is required
     * @param _pool The address of the pool to upkeep
     * @return Whether or not upkeep is needed for this single pool
     */
    function isUpkeepRequiredSinglePool(address _pool) public view override returns (bool) {
        if (!factory.isValidPool(_pool)) {
            return false;
        }

        // The update interval has passed
        return ILeveragedPool(_pool).intervalPassed();
    }

    /**
     * @notice Checks multiple pools if any of them need updating
     * @param _pools Array of pools to check
     * @return Whether or not at least one pool needs upkeeping
     * @dev Iterates over the provided array of pool addresses
     */
    function checkUpkeepMultiplePools(address[] calldata _pools) external view override returns (bool) {
        uint256 poolsLength = _pools.length;
        for (uint256 i = 0; i < poolsLength; i++) {
            if (isUpkeepRequiredSinglePool(_pools[i])) {
                // One has been found that requires upkeeping
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Called by keepers to perform an update on a single pool
     * @param _pool Address of the pool to be upkept
     * @dev Induces an update of the associated `PriceObserver` contract
     * @dev Tracks gas usage via `gasleft` accounting and uses this to inform
     *          keeper payment
     * @dev Catches any failure of the underlying `pool.poolUpkeep` call
     */
    function performUpkeepSinglePool(address _pool) public override {
        uint256 startGas = gasleft();

        // validate the pool, check that the interval time has passed
        if (!isUpkeepRequiredSinglePool(_pool)) {
            return;
        }

        /* update SMA oracle, does nothing for spot oracles */
        IOracleWrapper poolOracleWrapper = IOracleWrapper(ILeveragedPool(_pool).oracleWrapper());

        try poolOracleWrapper.poll() {} catch Error(string memory reason) {
            emit PoolUpkeepError(_pool, reason);
        }

        (
            int256 latestPrice,
            bytes memory data,
            uint256 savedPreviousUpdatedTimestamp,
            uint256 updateInterval
        ) = ILeveragedPool(_pool).getUpkeepInformation();

        // Start a new round
        // Get price in WAD format
        int256 lastExecutionPrice = executionPrice[_pool];

        /* This allows us to still batch multiple calls to
         * executePriceChange, even if some are invalid
         * without reverting the entire transaction */
        try ILeveragedPool(_pool).poolUpkeep(lastExecutionPrice, latestPrice) {
            executionPrice[_pool] = latestPrice;
            // If poolUpkeep is successful, refund the keeper for their gas costs
            uint256 gasSpent = startGas - gasleft();

            payKeeper(_pool, gasPrice, gasSpent, savedPreviousUpdatedTimestamp, updateInterval);
            emit UpkeepSuccessful(_pool, data, lastExecutionPrice, latestPrice);
        } catch Error(string memory reason) {
            // If poolUpkeep fails for any other reason, emit event
            emit PoolUpkeepError(_pool, reason);
        }
    }

    /**
     * @notice Called by keepers to perform an update on multiple pools
     * @param pools Addresses of each pool to upkeep
     * @dev Iterates over the provided array
     * @dev Essentially wraps calls to `performUpkeepSinglePool`
     */
    function performUpkeepMultiplePools(address[] calldata pools) external override {
        uint256 poolsLength = pools.length;
        for (uint256 i = 0; i < poolsLength; i++) {
            performUpkeepSinglePool(pools[i]);
        }
    }

    /**
     * @notice Pay keeper for upkeep
     * @param _pool Address of the given pool
     * @param _gasPrice Price of a single gas unit (in ETH (wei))
     * @param _gasSpent Number of gas units spent
     * @param _savedPreviousUpdatedTimestamp Last timestamp when the pool's price execution happened
     * @param _updateInterval Pool interval of the given pool
     * @dev Emits a `KeeperPaid` event if the underlying call to `pool.payKeeperFromBalances` succeeds
     * @dev Emits a `KeeperPaymentError` event otherwise
     */
    function payKeeper(
        address _pool,
        uint256 _gasPrice,
        uint256 _gasSpent,
        uint256 _savedPreviousUpdatedTimestamp,
        uint256 _updateInterval
    ) internal {
        uint256 reward = keeperReward(_pool, _gasPrice, _gasSpent, _savedPreviousUpdatedTimestamp, _updateInterval);
        if (ILeveragedPool(_pool).payKeeperFromBalances(msg.sender, reward)) {
            emit KeeperPaid(_pool, msg.sender, reward);
        } else {
            // Usually occurs if pool just started and does not have any funds
            emit KeeperPaymentError(_pool, msg.sender, reward);
        }
    }

    /**
     * @notice Payment keeper receives for performing upkeep on a given pool
     * @param _pool Address of the given pool
     * @param _gasPrice Price of a single gas unit (in ETH (wei))
     * @param _gasSpent Number of gas units spent
     * @param _savedPreviousUpdatedTimestamp Last timestamp when the pool's price execution happened
     * @param _poolInterval Pool interval of the given pool
     * @return Number of settlement tokens to give to the keeper for work performed
     */
    function keeperReward(
        address _pool,
        uint256 _gasPrice,
        uint256 _gasSpent,
        uint256 _savedPreviousUpdatedTimestamp,
        uint256 _poolInterval
    ) public view returns (uint256) {
        /**
         * Conceptually, we have
         *
         * Reward = Gas + Tip = Gas + (Base + Premium * Blocks)
         *
         * Very roughly to scale:
         *
         * +---------------------------+------+---+---+~~~~~
         * | GGGGGGGGGGGGGGGGGGGGGGGGG | BBBB | P | P | ...
         * +---------------------------+------+---+---+~~~~~
         *
         * Under normal circumstances, we don't expect there to be any time
         * premium at all. The time premium exists in order to *further*
         * incentivise upkeep in the event of lateness.
         *
         * The base tip exists to act as pure profit for a keeper.
         *
         * Of course, the gas component acts as compensation for performing
         * on-chain computation.
         *
         */

        // keeper gas cost in wei. WAD formatted
        uint256 _keeperGas = keeperGas(_pool, _gasPrice, _gasSpent);

        // tip percent
        uint256 _tipPercent = keeperTip(_savedPreviousUpdatedTimestamp, _poolInterval);

        // amount of settlement tokens to give to the keeper
        // _keeperGas + _keeperGas * percentTip
        uint256 wadRewardValue = _keeperGas + ((_keeperGas * _tipPercent) / 100);

        return wadRewardValue;
    }

    /**
     * @notice Compensation a keeper will receive for their gas expenditure
     * @param _pool Address of the given pool
     * @param _gasPrice Price of a single gas unit (in ETH (wei))
     * @param _gasSpent Number of gas units spent
     * @return Keeper's gas compensation
     * @dev Adds a constant to `_gasSpent` when calculating actual gas usage
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
            /* gas spent plus our fixed gas overhead */
            uint256 gasUsed = _gasSpent + FIXED_GAS_OVERHEAD;

            /* safe due to explicit bounds check for settlementTokenPrice above */
            /* (wei * Settlement / ETH) / fixed point (10^18) = amount in settlement */
            bytes16 _weiSpent = ABDKMathQuad.fromUInt(_gasPrice * gasUsed);
            bytes16 _settlementTokenPrice = ABDKMathQuad.fromUInt(uint256(settlementTokenPrice));
            return
                ABDKMathQuad.toUInt(ABDKMathQuad.div(ABDKMathQuad.mul(_weiSpent, _settlementTokenPrice), FIXED_POINT));
        }
    }

    /**
     * @notice Tip a keeper will receive for successfully updating the specified pool
     * @param _savedPreviousUpdatedTimestamp Last timestamp when the pool's price execution happened
     * @param _poolInterval Pool interval of the given pool
     * @return Percent of the `keeperGas` cost to add to payment, as a percent
     */
    function keeperTip(uint256 _savedPreviousUpdatedTimestamp, uint256 _poolInterval) public view returns (uint256) {
        /* the number of blocks that have elapsed since the given pool's updateInterval passed */
        uint256 elapsedBlocksNumerator = (block.timestamp - (_savedPreviousUpdatedTimestamp + _poolInterval));

        uint256 keeperTipAmount = BASE_TIP + (TIP_DELTA_PER_BLOCK * elapsedBlocksNumerator) / BLOCK_TIME;

        // In case of network outages or otherwise, we want to cap the tip so that the keeper cost isn't unbounded
        if (keeperTipAmount > MAX_TIP) {
            return MAX_TIP;
        } else {
            return keeperTipAmount;
        }
    }

    /**
     * @notice Sets the gas price to be used in compensating keepers for successful upkeep
     * @param _price Price (in ETH) per unit gas
     * @dev Only callable by the owner
     * @dev This function is only necessary due to the L2 deployment of Pools -- in reality, it should be `BASEFEE`
     * @dev Emits a `GasPriceChanged` event on success
     */
    function setGasPrice(uint256 _price) external onlyOwner {
        gasPrice = _price;
        emit GasPriceChanged(_price);
    }
}
