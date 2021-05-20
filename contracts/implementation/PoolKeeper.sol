// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/*
@title The manager contract for multiple markets and the pools in them
*/
contract PoolKeeper {
  // #### Roles
  /**
  @notice Use the Operator role to restrict access to the updateOracleWrapper function
   */
  bytes32 public constant OPERATOR = keccak256("OPERATOR");
}
