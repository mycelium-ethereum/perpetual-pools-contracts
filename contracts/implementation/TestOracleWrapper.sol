// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;
pragma abicoder v2;

import "../interfaces/IOracleWrapper.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV2V3Interface.sol";

/*
@title The oracle management contract for chainlink V3 oracles
*/
contract TestOracleWrapper is IOracleWrapper, Ownable {
    // #### Globals
    /**
     * @notice The address of the feed oracle
     */
    address public override oracle;
    int256 public price;
    int256 public constant INITIAL_PRICE = 1;
    int256 public constant PRICE_INCREMENT = 1;

    // #### Functions
    constructor(address _oracle) {
        setOracle(_oracle);
        price = INITIAL_PRICE;
    }

    function setOracle(address _oracle) public override onlyOwner {
        require(_oracle != address(0), "Oracle cannot be 0 address");
        oracle = _oracle;
    }

    function getPrice() external view override returns (int256) {
        return price;
    }

    function incrementPrice() external {
        price += PRICE_INCREMENT;
    }
}
