// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IOracleWrapper.sol";

/*
@title The oracle management contract
*/
contract OracleWrapper is IOracleWrapper {
  // #### Globals
  /**
  @notice Format: Market code => oracle address. Market code looks like TSLA/USD+aDAI
   */
  mapping(string => address) public assetOracles;
  // #### Roles
  /**
  @notice Use the Operator role to restrict access to the setOracle function
   */
  bytes32 public constant OPERATOR = keccak256("OPERATOR");

  // #### Functions
  function setOracle(string memory marketCode, address oracle)
    external
    override
  {}

  function getPrice(string memory marketCode, address oracle)
    external
    override
  {}
}
