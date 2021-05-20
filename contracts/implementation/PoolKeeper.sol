// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IPoolKeeper.sol";

/*
@title The manager contract for multiple markets and the pools in them
*/
contract PoolKeeper is IPoolKeeper {
  // #### Globals
  /**
    @notice Format: Pool code => pool address, where pool code looks like TSLA/USD^5+aDAI
   */
  mapping(string => address) public pools;
  address public oracleWrapper;

  // #### Roles
  /**
  @notice Use the Operator role to restrict access to the updateOracleWrapper function
   */
  bytes32 public constant OPERATOR = keccak256("OPERATOR");

  // #### Functions
  function triggerPriceUpdate(
    string memory marketCode,
    string[] memory poolCodes
  ) external override {}

  function updateOracleWrapper(address oracle) external override {}

  function createMarket(string memory marketCode, address oracle)
    external
    override
  {}

  function createPool(
    string memory marketCode,
    string memory poolCode,
    uint32 updateInterval,
    uint32 frontRunningInterval,
    uint16 fee,
    uint16 leverageAmount,
    address feeAddress,
    address quoteToken
  ) external override {}
}
