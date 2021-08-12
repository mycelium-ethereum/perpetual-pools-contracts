// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/*
@title The manager contract interface for multiple markets and the pools in them
*/
interface IPoolKeeper {
    // #### Events
    /**
     * @notice Creates a notification when a pool is created
     * @param poolAddress The pool address of the newly created pool. This is deterministic and utilizes create2 and the pool code as the salt.
     * @param firstPrice The price of the market oracle when the pool was created.
     * @param poolCode The code of the pool. This combined with the updateInterval provide the upkeep details.
     */
    event PoolAdded(address indexed poolAddress, int256 indexed firstPrice, address poolCode);

    /**
     * @notice Creates notification of a new round for a market/update interval pair
     * @param oldPrice The average price for the penultimate round
     * @param newPrice The average price for the round that's just ended
     * @param updateInterval The length of the round
     * @param poolCode The code for the pool being updated
     */
    event NewRound(int256 indexed oldPrice, int256 indexed newPrice, uint32 indexed updateInterval, address poolCode);

    /**
     * @notice Creates notification of a price execution for a set of pools
     * @param oldPrice The average price for the penultimate round
     * @param newPrice The average price for the round that's just ended
     * @param updateInterval The length of the round
     * @param pool The pool that is being updated
     * */
    event ExecutePriceChange(
        int256 indexed oldPrice,
        int256 indexed newPrice,
        uint32 indexed updateInterval,
        address pool
    );

    /**
     * @notice Creates a notification of a failed pool update
     * @param pool The pool that failed to update
     * @param reason The reason for the error
     */
    event PoolUpdateError(address pool, string reason);

    // #### Functions
    /**
     * @notice When a pool is created, this function is called by the factory to initiate price tracking.
     * @param _poolAddress The address of the newly-created pool.
     */
    function newPool(address _poolAddress) external;

    /**
     * @notice Sets the factory of the keeper contract
     * @param _factory Address of the new factory contract
     */
    function setFactory(address _factory) external;

    /**
     * @notice Check if upkeep is required
     * @dev This should not be called or executed.
     * @param poolCode The poolCode of the pool to upkeep
     * @return upkeepNeeded Whether or not upkeep is needed for this single pool
     */
    function checkUpkeepSinglePool(address poolCode) external view returns (bool upkeepNeeded);

    /**
     * @notice Checks multiple pools if any of them need updating
     * @param poolCodes The array of pool codes to check
     * @return upkeepNeeded Whether or not at least one pool needs upkeeping
     */
    function checkUpkeepMultiplePools(address[] calldata poolCodes) external view returns (bool upkeepNeeded);

    /**
     * @notice Called by keepers to perform an update on a single pool
     * @param poolCode The pool code to perform the update for.
     */
    function performUpkeepSinglePool(address poolCode) external;

    /**
     * @notice Called by keepers to perform an update on multiple pools
     * @param poolCodes pool codes to perform the update for.
     */
    function performUpkeepMultiplePools(address[] calldata poolCodes) external;
}
