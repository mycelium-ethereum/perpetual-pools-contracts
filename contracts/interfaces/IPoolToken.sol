//SPDX-License-Identifier: MIT 
pragma solidity 0.8.7;

/// @title Interface for the pool tokens
interface IPoolToken {
    function mint(uint256 amount, address account) external returns (bool);

    function burn(uint256 amount, address account) external returns (bool);
}
