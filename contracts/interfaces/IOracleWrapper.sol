// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

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
    @return The latest price
     */
    function getPrice(string memory marketCode) external view returns (int256);

    /**
    @notice Returns the oracle for a given market code
    @dev This is a convenience definition for the auto generated getter so you don't need to import the full contract to use it.
    @param marketCode The market code to look up
    @return The oracle address
 */
    function assetOracles(string memory marketCode) external view returns (address);
}
