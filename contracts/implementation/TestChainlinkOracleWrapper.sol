// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IOracleWrapper.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@chainlink/contracts/src/v0.7/interfaces/AggregatorV2V3Interface.sol";

/*
@title The oracle management contract for chainlink V3 oracles
*/
contract TestChainlinkOracleWrapper is IOracleWrapper, AccessControl {
    // #### Globals
    /**
  @notice The address of the feed oracle
   */
    address public override oracle;
    uint256 public price;

    // #### Roles
    /**
  @notice Use the Operator role to restrict access to the setOracle function
   */
    bytes32 public constant OPERATOR = keccak256("OPERATOR");
    bytes32 public constant ADMIN = keccak256("ADMIN");

    // #### Functions
    constructor(address _oracle) {
        _setupRole(ADMIN, msg.sender);
        _setRoleAdmin(OPERATOR, ADMIN);
        setOracle(_oracle);
    }

    function setOracle(address _oracle) public override onlyOperator {
        require(oracle != address(0), "Oracle cannot be 0 address");
        oracle = _oracle;
    }

    function getPrice() external view override returns (int256) {
        (, int256 price, , uint256 timeStamp, ) = AggregatorV2V3Interface(oracle).latestRoundData();
        require(timeStamp > 0, "Round not complete");
        return price;
    }

    function increasePrice() external {
        price += 1;
    }

    // #### Modifiers
    modifier onlyOperator() {
        require(hasRole(OPERATOR, msg.sender));
        _;
    }
}
