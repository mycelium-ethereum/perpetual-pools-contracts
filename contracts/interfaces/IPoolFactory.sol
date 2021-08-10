// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/**
@title The contract factory for the keeper and pool contracts. Utilizes minimal clones to keep gas costs low.
*/
interface IPoolFactory {
    // #### Events
    event DeployPool(address indexed pool, string ticker);

    // #### Getters for Globals
    function pools(uint256 id) external view returns (address);

    function poolIdTaken(
        string calldata poolCode,
        address quoteToken,
        address oracleWrapper
    ) external view returns (bool);

    function numPools() external view returns (uint256);

    function isValidPool(address _pool) external view returns (bool);

    struct PoolDeployment {
        string poolCode; // The pool identification code. This is unique per pool per pool keeper
        uint32 frontRunningInterval; // The minimum number of seconds that must elapse before a commit can be executed. Must be smaller than or equal to the update interval to prevent deadlock.
        uint32 updateInterval; // The minimum number of seconds that must elapse before a price change
        bytes16 fee; // The fund movement fee. This amount is extracted from the deposited asset with every update and sent to the fee address.
        uint16 leverageAmount; // The amount of exposure to price movements for the pool
        address feeAddress; // The address that the fund movement fee is sent to
        address quoteToken; // The digital asset that the pool accepts
        address oracleWrapper; // The IOracleWrapper implementation for fetching feed data
    }

    // #### Functions
    /**
     * @notice Deploys a LeveragedPool contract
     * @param deploymentParameters Parameters for the new market deployment
     * @return The address of the new pool
     */
    function deployPool(PoolDeployment calldata deploymentParameters) external returns (address);
}
