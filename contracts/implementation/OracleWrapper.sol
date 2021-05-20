// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/*
@title The oracle management contract
*/
contract OracleWrapper {
  // #### Roles
  /**
  @notice Use the Operator role to restrict access to the setOracle function
   */
  bytes32 public constant OPERATOR = keccak256("OPERATOR");
}
