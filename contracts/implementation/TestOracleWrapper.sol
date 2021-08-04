// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IOracleWrapper.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@chainlink/contracts/src/v0.7/interfaces/AggregatorV2V3Interface.sol";

import "hardhat/console.sol";

/*
@title The oracle management contract for chainlink V3 oracles
*/
contract TestOracleWrapper is IOracleWrapper, AccessControl {
    // #### Globals
    /**
     * @notice The address of the feed oracle
     */
    address public override oracle;
    int256 public price;
    int256 public constant INITIAL_PRICE = 1;
    int256 public constant PRICE_INCREMENT = 1;

    // #### Roles
    /**
     * @notice Use the Operator role to restrict access to the setOracle function
     */
    bytes32 public constant OPERATOR = keccak256("OPERATOR");
    bytes32 public constant ADMIN = keccak256("ADMIN");
    string public constant OPERATOR_STRING = "OPERATOR";
    string public constant ADMIN_STRING = "ADMIN";

    // #### Functions
    constructor(address _oracle) {
        // TODO AccessControl is changing to Ownable model
        // _setupRole(abi.encodePacked(ADMIN, msg.sender), msg.sender);
        bytes32 newAdminRole = keccak256(abi.encodePacked(ADMIN_STRING, msg.sender));
        _setupRole(newAdminRole, msg.sender);
        _setRoleAdmin(OPERATOR, newAdminRole);
        setOracle(_oracle);
        price = INITIAL_PRICE;
    }

    function setOracle(address _oracle) public override onlyOperator {
        require(_oracle != address(0), "Oracle cannot be 0 address");
        oracle = _oracle;
    }

    function getPrice() external view override returns (int256) {
        return price;
    }

    function incrementPrice() external {
        price += PRICE_INCREMENT;
    }

    function switchAdmin(address _admin) external override onlyOperator {
        bytes32 newAdminRole = keccak256(abi.encodePacked(ADMIN_STRING, _admin));
        _setupRole(newAdminRole, _admin);
        _setRoleAdmin(OPERATOR, newAdminRole);
    }

    function isAdmin(address account) public view override returns (bool) {
        return (getRoleAdmin(OPERATOR) == keccak256(abi.encodePacked(ADMIN_STRING, account)));
    }

    // #### Modifiers
    modifier onlyOperator() {
        require(isAdmin(msg.sender), "msg.sender not admin");
        _;
    }
}
