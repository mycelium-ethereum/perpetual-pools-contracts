// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/// @title The decimals interface for extending the ERC20 interface
interface IERC20DecimalsWrapper {
    function decimals() external view returns (uint8);
}
