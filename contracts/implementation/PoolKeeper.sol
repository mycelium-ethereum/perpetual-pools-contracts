// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolKeeper.sol";
import "../interfaces/IOracleWrapper.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/*
@title The manager contract for multiple markets and the pools in them
*/
contract PoolKeeper is IPoolKeeper, AccessControl {
  // #### Globals
  /**
    @notice Format: Pool code => pool address, where pool code looks like TSLA/USD^5+aDAI
   */
  mapping(string => address) public pools;
  address public oracleWrapper;

  // #### Roles
  /**
  @notice Use the Operator role to restrict access to the updateOracleWrapper function
   */
  bytes32 public constant OPERATOR = keccak256("OPERATOR");
  bytes32 public constant ADMIN = keccak256("ADMIN");

  // #### Functions
  constructor(address _oracleWrapper) {
    oracleWrapper = _oracleWrapper;
    _setRoleAdmin(ADMIN, OPERATOR);
    _setupRole(ADMIN, msg.sender);
    _setupRole(OPERATOR, msg.sender);
  }

  function triggerPriceUpdate(
    string memory marketCode,
    string[] memory poolCodes
  ) external override {}

  function updateOracleWrapper(address oracle) external override {}

  function createMarket(string memory marketCode, address oracle)
    external
    override
  {
    IOracleWrapper wrapper = IOracleWrapper(oracleWrapper);
    require(
      wrapper.assetOracles(marketCode) == address(0),
      "Unable to update a market's oracle"
    );
    wrapper.setOracle(marketCode, oracle);
  }

  function createPool(
    string memory marketCode,
    string memory poolCode,
    uint32 updateInterval,
    uint32 frontRunningInterval,
    uint16 fee,
    uint16 leverageAmount,
    address feeAddress,
    address quoteToken
  ) external override {}
}
