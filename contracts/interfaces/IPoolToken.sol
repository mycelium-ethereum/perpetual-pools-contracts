// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/*
@title The pool token contract interface
*/
interface IPoolToken {
    function mint(uint256 amount, address account) external returns (bool);

    function burn(uint256 amount, address account) external returns (bool);

    function _totalSupply() external view returns (uint256);
}
