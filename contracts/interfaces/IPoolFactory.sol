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
