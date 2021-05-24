// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IOracleWrapper.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@chainlink/contracts/src/v0.7/interfaces/AggregatorV2V3Interface.sol";

/*
@title The oracle management contract
*/
contract OracleWrapper is IOracleWrapper, AccessControl {
  // #### Globals
  /**
  @notice Format: Market code => oracle address. Market code looks like TSLA/USD+aDAI
  @dev override in place for the getter function definition from the interface
   */
  mapping(string => address) public override assetOracles;

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
    require(oracle != address(0), "Oracle cannot be 0 address");
    assetOracles[marketCode] = oracle;
  }

  function getPrice(string memory marketCode)
    external
    view
    override
    returns (int256)
  {
    (, int256 price, , uint256 timeStamp, ) =
      AggregatorV2V3Interface(assetOracles[marketCode]).latestRoundData();
    require(timeStamp > 0, "Round not complete");
    return price;
  }

  // #### Modifiers
  modifier onlyOperator {
    require(hasRole(OPERATOR, msg.sender));
    _;
  }
}
