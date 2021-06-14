pragma solidity ^0.7.6;
pragma abicoder v2;

/*
@title A mockup oracle wrapper. Don't use for production.
*/
contract TestOracleWrapper {
  mapping(string => address) public assetOracles;

  function setOracle(string memory marketCode, address oracle) external {
    require(oracle != address(0), "Oracle cannot be 0 address");
    assetOracles[marketCode] = oracle;
  }

  function getPrice() external view returns (int256) {
    return int256(block.number);
  }
}
