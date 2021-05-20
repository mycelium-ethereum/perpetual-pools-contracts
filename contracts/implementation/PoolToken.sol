pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/*
@title The pool token
*/
contract PoolToken is ERC20, Ownable {
    constructor(string name, string symbol) ERC721(name, symbol) public {
    }

    function mint(uint amount, address account) external onlyOwner {
        _mint(amount, account);
    }
    function burn(uint amount, address account) external onlyOwner {
        _burn(amount, account);
    }
}
