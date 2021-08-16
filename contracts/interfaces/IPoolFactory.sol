// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/**
@title The contract factory for the keeper and pool contracts. Utilizes minimal clones to keep gas costs low.
*/
interface IPoolFactory {
    // #### Events
    event DeployPool(address indexed pool, string ticker);

    // #### Getters for Globals
    function pools(uint256 id) external view returns (address);

    function numPools() external view returns (uint256);

    function isValidPool(address _pool) external view returns (bool);

    struct PoolDeployment {
        string poolName; // The name to identify a pool by
        uint32 frontRunningInterval; // The minimum number of seconds that must elapse before a commit can be executed. Must be smaller than or equal to the update interval to prevent deadlock.
        uint32 updateInterval; // The minimum number of seconds that must elapse before a price change
        uint16 leverageAmount; // The amount of exposure to price movements for the pool
        address quoteToken; // The digital asset that the pool accepts
        address oracleWrapper; // The IOracleWrapper implementation for fetching feed data
        address settlementEthOracle;
    }

    // #### Functions
    /**
     * @notice Deploys a LeveragedPool contract
     * @param deploymentParameters Parameters for the new market deployment
     * @return The address of the new pool
     */
    function deployPool(PoolDeployment calldata deploymentParameters) external returns (address);

    function setPoolKeeper(address _poolKeeper) external;

    function setMaxLeverage(uint16 newMaxLeverage) external;

    function setFeeReceiver(address _feeReceiver) external;

    function setFee(bytes16 _fee) external;

    function setPoolCommitterDeployer(address _poolCommitterDeployer) external;
}
