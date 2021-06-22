// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";

/*
@title The pool token
*/
contract PoolToken is ERC20, Ownable, Initializable {
  // #### Global state
  mapping(address => uint256) internal _balances;

  mapping(address => mapping(address => uint256)) internal _allowances;

  uint256 internal _totalSupply;

  string internal _name;
  string internal _symbol;
  uint8 internal _decimals;

  // #### Functions

  constructor() ERC20("BASE_TOKEN", "BASE") {}

  /**
  @notice Minimal clone initialization function
   */
  function initialize(
    address _owner,
    string memory name_,
    string memory symbol_
  ) external initializer {
    transferOwnership(_owner);
    _name = name_;
    _symbol = symbol_;
    _decimals = 18;
  }

  function mint(uint256 amount, address account)
    external
    onlyOwner
    returns (bool)
  {
    _mint(account, amount);
    return true;
  }

  function burn(uint256 amount, address account)
    external
    onlyOwner
    returns (bool)
  {
    _burn(account, amount);
    return true;
  }
}
