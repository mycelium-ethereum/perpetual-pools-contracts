// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/**
@title The contract factory for the keeper and pool contracts. Utilizes minimal clones to keep gas costs low.
*/
interface IPoolFactory {
    // #### Events

    event DeployPool(address indexed pool, string poolCode);

    // #### Functions
    /**
    @notice Deploys a LeveragedPool contract
    @param owner The address of the pool keeper that will administer the pool
    @param _poolCode The pool identification code. This is unique per pool per pool keeper
    @param _frontRunningInterval The minimum number of seconds that must elapse before a commit can be executed. Must be smaller than the update interval to prevent deadlock. The difference must be greater than 15 seconds.
    @param _fee The fund movement fee. This amount is extracted from the deposited asset with every update and sent to the fee address.
    @param _leverageAmount The amount of exposure to price movements for the pool
    @param _feeAddress The address that the fund movement fee is sent to
    @param _quoteToken The digital asset that the pool accepts
    @return The address of the new pool
   */
    function deployPool(
        address owner,
        string memory _poolCode,
        uint32 _frontRunningInterval,
        bytes16 _fee,
        uint16 _leverageAmount,
        address _feeAddress,
        address _quoteToken
    ) external returns (address);
}
