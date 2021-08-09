// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/*
@title The manager contract interface for multiple markets and the pools in them
*/
interface IPoolKeeper {
    // #### Structs
    struct Upkeep {
        int256 executionPrice; // The price for the current execution
        int256 lastExecutionPrice; // The last price executed on.
        uint40 roundStart;
    }

    // #### Events
    /**
     * @notice Creates a notification when a pool is created
     * @param poolAddress The pool address of the newly created pool. This is deterministic and utilizes create2 and the pool code as the salt.
     * @param firstPrice The price of the market oracle when the pool was created.
     * @param poolCode The code of the pool. This combined with the updateInterval provide the upkeep details.
     */
    event PoolAdded(address indexed poolAddress, int256 indexed firstPrice, address poolCode);

    /**
     * @notice Creates a notification when a market is created
     * @param marketCode The market identifier for the new market
     * @param oracle The oracle that will be used for price updates
     */
    event CreateMarket(string marketCode, address oracle);

    /**
     * @notice Creates notification of a new round for a market/update interval pair
     * @param oldPrice The average price for the penultimate round
     * @param newPrice The average price for the round that's just ended
     * @param updateInterval The length of the round
     * @param poolCode The code for the pool being updated
     */
    event NewRound(int256 indexed oldPrice, int256 indexed newPrice, uint32 indexed updateInterval, address poolCode);

    /**
     * @notice Creates a notification of a price sample being taken
     * @param cumulativePrice The sum of all samples taken for this round
     * @param count The number of samples inclusive
     * @param updateInterval The length of the round
     * @param market The market that's being updated
     */
    event PriceSample(
        int256 indexed cumulativePrice,
        int256 indexed count,
        uint32 indexed updateInterval,
        string market
    );

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
    function newPool(
        string memory _poolCode,
        address _poolAddress,
        address _quoteToken,
        address _oracleWrapper
    ) external;

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

    /**
     * @notice Getter for the poolIdTaken mapping
     */
    function poolIdTaken(
        string calldata poolCode,
        address quoteToken,
        address oracleWrapper
    ) external view returns (bool);
}
