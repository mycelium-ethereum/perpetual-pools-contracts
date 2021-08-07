// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../vendors/ERC20_Cloneable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/*
@title The pool token
*/
contract PoolToken is ERC20_Cloneable, Ownable {
    // #### Global state

    // #### Functions

    constructor() ERC20_Cloneable("BASE_TOKEN", "BASE") {}

    function mint(uint256 amount, address account) external onlyOwner returns (bool) {
        _mint(account, amount);
        return true;
    }

    function burn(uint256 amount, address account) external onlyOwner returns (bool) {
        _burn(account, amount);
        return true;
    }
}
