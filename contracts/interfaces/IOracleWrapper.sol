// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
@title The oracle management contract interface
*/
interface IOracleWrapper {
  // #### Functions
  /**
    @notice Sets the oracle for a given market
    @dev Should be secured, ideally only allowing the PoolKeeper to access.
    @param marketCode The market code for the market.
    @param oracle The oracle to set for the market
   */
  function setOracle(string memory marketCode, address oracle) external;

  /**
    @notice Returns the current price for the asset in question
    @param marketCode The market code for the asset to quote for.
     */
  function getPrice(string memory marketCode, address oracle) external;
}
