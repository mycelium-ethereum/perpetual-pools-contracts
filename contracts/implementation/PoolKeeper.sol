//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IPoolKeeper.sol";
import "../interfaces/IOracleWrapper.sol";
import "../interfaces/IPoolFactory.sol";
import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IERC20DecimalsWrapper.sol";
import "../interfaces/IKeeperRewards.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "abdk-libraries-solidity/ABDKMathQuad.sol";

/// @title The manager contract for multiple markets and the pools in them
/// @dev Currently, this contract estimates the best keeper rewards in a way that is best suited for Ethereum L1.
/// @dev It assumes an approximate block time of 13 seconds, and an Ethereum-like gas system.
/// @dev This code was also written with Arbitrum deployment in mind, meaning there exists no `block.basefee`, and no arbitrum gas price oracle.
/// @dev It has another large drawback in that it is not possible to calculate the cost of the current transaction Arbitrum, given that the cost is largely determined by L1 calldata cost.
/// @dev Because of this, the reward calculation is an rough "good enough" estimation.
contract PoolKeeper is IPoolKeeper, Ownable {
    // #### Global variables
    /**
     * @notice Format: Pool address => last executionPrice
     */
    mapping(address => int256) public executionPrice;

    IPoolFactory public immutable factory;
    // The KeeperRewards contract permissioned to pay out pool upkeep rewards
    address public override keeperRewards;

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
        IOracleWrapper(ILeveragedPool(_poolAddress).oracleWrapper()).poll();
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
     * @dev Tracks gas usage via `gasleft` accounting and uses this to inform
     *          keeper payment
     * @dev Catches any failure of the underlying `pool.poolUpkeep` call
     * @dev Emits a `KeeperPaid` event if the underlying call to `pool.payKeeperFromBalances` succeeds
     * @dev Emits a `KeeperPaymentError` event otherwise
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
            emit UpkeepSuccessful(_pool, data, lastExecutionPrice, latestPrice);
        } catch Error(string memory reason) {
            // If poolUpkeep fails for any other reason, emit event
            emit PoolUpkeepError(_pool, reason);
        }

        uint256 gasSpent = startGas - gasleft();
        uint256 reward;
        // Emit events depending on whether or not the reward was actually paid
        if (
            IKeeperRewards(keeperRewards).payKeeper(
                msg.sender,
                _pool,
                gasPrice,
                gasSpent,
                savedPreviousUpdatedTimestamp,
                updateInterval
            ) > 0
        ) {
            emit KeeperPaid(_pool, msg.sender, reward);
        } else {
            emit KeeperPaymentError(_pool, msg.sender, reward);
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

    function setKeeperRewards(address _keeperRewards) external override onlyOwner {
        require(_keeperRewards != address(0), "KeeperRewards cannot be 0 address");
        address oldKeeperRewards = keeperRewards;
        keeperRewards = _keeperRewards;
        emit KeeperRewardsSet(oldKeeperRewards, _keeperRewards);
    }

    /**
     * @notice Sets the gas price to be used in compensating keepers for successful upkeep
     * @param _price Price (in ETH) per unit gas
     * @dev Only callable by the owner
     * @dev This function is only necessary due to the L2 deployment of Pools -- in reality, it should be `BASEFEE`
     * @dev Emits a `GasPriceChanged` event on success
     */
    function setGasPrice(uint256 _price) external override onlyOwner {
        gasPrice = _price;
        emit GasPriceChanged(_price);
    }
}
