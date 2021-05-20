// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

/*
@title The pool token
*/
contract PoolToken is ERC20, Ownable, Initializable {
  function initialize(string memory name, string memory symbol) initializer {
    __ERC20_init(name, symbol);
  }

  function mint(uint256 amount, address account) external onlyOwner {
    _mint(account, amount);
  }

  function burn(uint256 amount, address account) external onlyOwner {
    _burn(account, amount);
  }
}
