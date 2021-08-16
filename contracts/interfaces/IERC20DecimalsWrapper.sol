// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/**
@title The oracle management contract interface
*/
interface IERC20DecimalsWrapper {
    function decimals() external view returns (uint8);
}
