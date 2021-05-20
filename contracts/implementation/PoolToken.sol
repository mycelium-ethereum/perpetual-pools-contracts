// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/*
@title The pool token
*/
contract PoolToken is ERC20, Ownable {
  constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

  function mint(uint256 amount, address account) external onlyOwner {
    _mint(account, amount);
  }

  function burn(uint256 amount, address account) external onlyOwner {
    _burn(account, amount);
  }
}
