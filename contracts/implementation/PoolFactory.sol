// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolFactory.sol";
import "../interfaces/ILeveragedPool.sol";
import "./LeveragedPool.sol";
import "./PoolToken.sol";
import "./PoolKeeper.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/*
@title The oracle management contract
*/
contract PoolFactory is IPoolFactory, Ownable {
    // #### Globals
    PoolToken public pairTokenBase;
    LeveragedPool public poolBase;
    IPoolKeeper public poolKeeper;

    /**
     * @notice Format: Pool code => quote token => oracle wrapper => bool
     * @dev ensures that the factory does not deterministicly deploy pools that already exist
     */
    mapping(string => mapping(address => mapping(address => bool))) public override poolIdTaken;

    /**
     * @notice Format: Pool counter => pool address
     */
    mapping(uint256 => address) public override pools;
    uint256 public override numPools;

    /**
     * @notice Format: Pool address => validity
     */
    mapping(address => bool) public override isValidPool;

    // #### Functions
    constructor() {
        // Deploy base contracts
        pairTokenBase = new PoolToken();
        poolBase = new LeveragedPool();

        ILeveragedPool.Initialization memory baseInitialization = ILeveragedPool.Initialization(
            address(this),
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
        // Init bases
        poolBase.initialize(baseInitialization);

        pairTokenBase.initialize(address(this), "BASE_TOKEN", "BASE");
    }

    function deployPool(PoolDeployment calldata deploymentParameters) external override returns (address) {
        require(address(poolKeeper) != address(0), "PoolKeeper not set");
        require(
            !poolIdTaken[deploymentParameters.poolCode][deploymentParameters.quoteToken][
                deploymentParameters.oracleWrapper
            ],
            "Pool ID in use"
        );
        require(
            deploymentParameters.owner != address(0) &&
                deploymentParameters.quoteToken != address(0) &&
                deploymentParameters.oracleWrapper != address(0) &&
                deploymentParameters.feeAddress != address(0) &&
                deploymentParameters.keeper != address(0),
            "PoolKeeper: zero address as param"
        );
        LeveragedPool pool = LeveragedPool(
            // pools are unique based on poolCode, quoteToken and oracle
            Clones.cloneDeterministic(
                address(poolBase),
                keccak256(
                    abi.encode(
                        deploymentParameters.poolCode,
                        deploymentParameters.quoteToken,
                        deploymentParameters.oracleWrapper
                    )
                )
            )
        );
        address _pool = address(pool);
        emit DeployPool(_pool, deploymentParameters.poolCode);

        ILeveragedPool.Initialization memory initialization = ILeveragedPool.Initialization(
            deploymentParameters.owner,
            deploymentParameters.keeper,
            deploymentParameters.oracleWrapper,
            deployPairToken(
                _pool,
                string(abi.encodePacked(deploymentParameters.poolCode, "-LONG")),
                string(abi.encodePacked("L-", deploymentParameters.poolCode)),
                deploymentParameters.quoteToken,
                deploymentParameters.oracleWrapper
            ),
            deployPairToken(
                _pool,
                string(abi.encodePacked(deploymentParameters.poolCode, "-SHORT")),
                string(abi.encodePacked("S-", deploymentParameters.poolCode)),
                deploymentParameters.quoteToken,
                deploymentParameters.oracleWrapper
            ),
            deploymentParameters.poolCode,
            deploymentParameters.frontRunningInterval,
            deploymentParameters.updateInterval,
            deploymentParameters.fee,
            deploymentParameters.leverageAmount,
            deploymentParameters.feeAddress,
            deploymentParameters.quoteToken
        );
        pool.initialize(initialization);
        poolKeeper.newPool(_pool);
        pools[numPools] = _pool;
        numPools += 1;
        return address(pool);
    }

    function deployPairToken(
        address owner,
        string memory name,
        string memory symbol,
        address quoteToken,
        address oracleWrapper
    ) internal returns (address) {
        // pools are unique based on poolCode, quoteToken and oracle -> pool tokens should be the same
        PoolToken pairToken = PoolToken(
            Clones.cloneDeterministic(address(pairTokenBase), keccak256(abi.encode(name, quoteToken, oracleWrapper)))
        );
        pairToken.initialize(owner, name, symbol);
        return address(pairToken);
    }

    function setPoolKeeper(address _poolKeeper) external onlyOwner {
        poolKeeper = IPoolKeeper(_poolKeeper);
    }
}
