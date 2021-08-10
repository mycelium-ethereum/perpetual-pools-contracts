// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/*
@title The interface for the contract that handles pool price changes
*/
interface IPriceChanger {
    event PriceChange(int256 indexed startPrice, int256 indexed endPrice, uint112 indexed transferAmount);

    // #### Functions
    function executePriceChange(int256 oldPrice, int256 newPrice) external;

    function updateFeeAddress(address account) external;
}
