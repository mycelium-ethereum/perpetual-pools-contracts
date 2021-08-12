// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/*
@title The interface for the contract that handles pool price changes
*/
interface IPriceChanger {
    event PriceChange(int256 indexed startPrice, int256 indexed endPrice, uint112 indexed transferAmount);

    // #### Functions
    function executePriceChange(int256 oldPrice, int256 newPrice) external;

    function updateFeeAddress(address account) external;

    function setPool(address _pool) external;
}
