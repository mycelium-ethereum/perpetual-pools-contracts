// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../implementation/PoolSwapLibrary.sol";

/**
@title The contract factory for the keeper and pool contracts. Utilizes minimal clones to keep gas costs low.
*/
interface IPoolFactory {
    // #### Events

    event DeployPool(address indexed pool, string ticker);

    // #### Functions
    /**
    @notice Deploys a LeveragedPool contract
    @return The address of the new pool
   */
    function deployPool(PoolSwapLibrary.PoolDeployment memory deploymentParameters) external returns (address);
}
