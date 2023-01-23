pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract WrappedToken is ERC20 {
    mapping(address => mapping(address => uint256)) private balances;
    mapping(address => bool) private allowed;

    constructor(address[] memory tokens, string memory _name, string memory _symbol) ERC20(_name, _symbol) {
        for (uint256 i = 0; i < tokens.length; i++) {
            allowed[tokens[i]] = true;
        }
    }

    // Deposit tokens
    function deposit(address tokenAddress, uint256 amount) public {
        require(IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        balances[msg.sender][tokenAddress] += amount;
        _mint(msg.sender, amount);
    }

    // Withdraw tokens
    function withdraw(address tokenAddress, uint256 amount) public {
        require(balances[msg.sender][tokenAddress] >= amount, "Insufficient balance");
        require(IERC20(tokenAddress).transfer(msg.sender, amount), "Transfer failed");
        balances[msg.sender][tokenAddress] -= amount;
        _burn(msg.sender, amount);
    }
}
