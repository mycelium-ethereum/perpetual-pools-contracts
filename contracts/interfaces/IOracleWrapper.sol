// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/// @title The oracle wrapper contract interface
interface IOracleWrapper {
    function oracle() external view returns (address);

    // #### Functions
    /**
     * @notice Sets the oracle for a given market
     * @dev Should be secured, ideally only allowing the PoolKeeper to access
     * @param _oracle The oracle to set for the market
     */
    function setOracle(address _oracle) external;

    /**
     * @notice Returns the current price for the asset in question
     * @return The latest price
     */
    function getPrice() external view returns (int256);

    /**
     * @notice Converts from a WAD to normal value
     * @return Converted non-WAD value
     */
    function fromWad(int256 wad) external view returns (int256);
}
