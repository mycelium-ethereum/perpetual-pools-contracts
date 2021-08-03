// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolFactory.sol";
import "./LeveragedPool.sol";
import "./PoolToken.sol";
import "./PoolKeeper.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/*
@title The oracle management contract
*/
contract PoolFactory is IPoolFactory, AccessControl {
    // #### Globals
    PoolToken public pairTokenBase;
    LeveragedPool public poolBase;
    IPoolKeeper public poolKeeper;

    // #### Roles
    /**
  @notice Use the Operator role to restrict access to the setPoolKeeper function
   */
    bytes32 public constant OPERATOR = keccak256("OPERATOR");
    bytes32 public constant ADMIN = keccak256("ADMIN");

    // #### Functions
    constructor() {
        // Deploy base contracts
        pairTokenBase = new PoolToken();
        poolBase = new LeveragedPool();
        _setupRole(ADMIN, msg.sender);
        _setRoleAdmin(OPERATOR, ADMIN);

        // Init bases
        poolBase.initialize(
            address(0),
            address(this),
            address(0),
            address(0),
            "BASE_POOL",
            2,
            2,
            0,
            0,
            address(this),
            address(this)
        );

        pairTokenBase.initialize(address(this), "BASE_TOKEN", "BASE");
    }

    function deployPool(PoolDeployment memory deploymentParameters) external override returns (address) {
        require(address(poolKeeper) != address(0), "PoolKeeper not set");
        LeveragedPool pool = LeveragedPool(
            Clones.cloneDeterministic(address(poolBase), keccak256(abi.encode(deploymentParameters.poolCode)))
        );
        emit DeployPool(address(pool), deploymentParameters.poolCode);
        pool.initialize(
            deploymentParameters.owner,
            deploymentParameters.oracleWrapper,
            deployPairToken(
                address(pool),
                string(abi.encodePacked(deploymentParameters.poolCode, "-LONG")),
                string(abi.encodePacked("L-", deploymentParameters.poolCode))
            ),
            deployPairToken(
                address(pool),
                string(abi.encodePacked(deploymentParameters.poolCode, "-SHORT")),
                string(abi.encodePacked("S-", deploymentParameters.poolCode))
            ),
            deploymentParameters.poolCode,
            deploymentParameters.frontRunningInterval,
            deploymentParameters.updateInterval,
            deploymentParameters.fee,
            deploymentParameters.leverageAmount,
            deploymentParameters.feeAddress,
            deploymentParameters.quoteToken
        );

        poolKeeper.newPool(deploymentParameters.poolCode, address(pool));
        return address(pool);
    }

    function deployPairToken(
        address owner,
        string memory name,
        string memory symbol
    ) internal returns (address) {
        PoolToken pairToken = PoolToken(Clones.cloneDeterministic(address(pairTokenBase), keccak256(abi.encode(name))));
        pairToken.initialize(owner, name, symbol);
        return address(pairToken);
    }

    function setPoolKeeper(address _poolKeeper) external onlyOperator {
        poolKeeper = IPoolKeeper(_poolKeeper);
    }

    function setOperator(address _operator) external onlyOperator {
        revokeRole(ADMIN, msg.sender);
        grantRole(ADMIN, _operator);
    }

    // #### Modifiers
    modifier onlyOperator() {
        require(hasRole(ADMIN, msg.sender), "msg sender not ADMIN");
        // TODO check this
        // require(hasRole(OPERATOR, msg.sender), "msg sender not OPERATOR");
        _;
    }
}
