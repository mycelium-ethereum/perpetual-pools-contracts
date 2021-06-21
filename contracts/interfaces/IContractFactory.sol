// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/**
@title The contract factory for the keeper and pool contracts. Utilizes minimal clones to keep gas costs low.
*/
interface IOracleWrapper {
  // #### Functions
  /**
    @notice Deploys a LeveragedPool contract
    @return The address of the new pool
   */
  function deployPool(address owner) external returns (address);

  /**
    @notice Deploys an ERC20 token for use as a pair token
    @return The address of the new token
   */
  function deployPairToken(
    address owner,
    string memory name,
    string memory symbol
  ) external returns (address);
}
