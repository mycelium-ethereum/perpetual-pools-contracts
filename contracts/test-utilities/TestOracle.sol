// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/*
@title A mockup oracle wrapper. Don't use for production.
*/
contract TestOracleWrapper {
  mapping(string => address) public assetOracles;
  bool public priceFreeze = false;
  int256 internal price;

  function setOracle(string memory marketCode, address oracle) external {
    require(oracle != address(0), "Oracle cannot be 0 address");
    assetOracles[marketCode] = oracle;
  }

  function increasePrice() external {
    price += 1;
  }

  function getPrice(string memory marketCode) external view returns (int256) {
    return price;
  }
}
