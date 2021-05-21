// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IOracleWrapper.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@chainlink/contracts/src/v0.7/interfaces/AggregatorV3Interface.sol";

// TODO: ### REMOVE FOR PRODUCTION
import "hardhat/console.sol";

/*
@title The oracle management contract
*/
contract OracleWrapper is IOracleWrapper, AccessControl {
  // #### Globals
  /**
  @notice Format: Market code => oracle address. Market code looks like TSLA/USD+aDAI
   */
  mapping(string => address) public assetOracles;
  // #### Roles
  /**
  @notice Use the Operator role to restrict access to the setOracle function
   */
  bytes32 public constant OPERATOR = keccak256("OPERATOR");
  bytes32 public constant ADMIN = keccak256("ADMIN");

  // #### Functions
  constructor() {
    _setupRole(ADMIN, msg.sender);
    _setRoleAdmin(OPERATOR, ADMIN);
  }

  function setOracle(string memory marketCode, address oracle)
    external
    override
    onlyOperator
  {
    assetOracles[marketCode] = oracle;
  }

  function getPrice(string memory marketCode)
    external
    view
    override
    returns (int256)
  {
    (, int256 price, , uint256 timeStamp, ) =
      AggregatorV3Interface(assetOracles[marketCode]).latestRoundData();
    require(timeStamp > 0, "Round not complete");
    return price;
  }

  // #### Modifiers
  modifier onlyOperator {
    require(hasRole(OPERATOR, msg.sender));
    _;
  }
}
