// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolFactory.sol";
import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPriceChangerDeployer.sol";
import "../interfaces/IPoolCommittorDeployer.sol";
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
    IPriceChangerDeployer public priceChangerDeployer;
    IPoolCommittorDeployer public poolCommittorDeployer;

    // #### Functions
    constructor(address _poolCommittorDeployer, address _priceChangerDeployer) {
        // Deploy base contracts
        pairTokenBase = new PoolToken();
        poolBase = new LeveragedPool();

        ILeveragedPool.Initialization memory baseInitialization = ILeveragedPool.Initialization(
            address(this),
            address(0),
            address(this),
            address(0),
            address(0),
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
        poolCommittorDeployer = IPoolCommittorDeployer(_poolCommittorDeployer);
        priceChangerDeployer = IPriceChangerDeployer(_priceChangerDeployer);

        pairTokenBase.initialize(address(this), "BASE_TOKEN", "BASE");
    }

    function deployPool(PoolDeployment calldata deploymentParameters) external override returns (address) {
        require(address(poolKeeper) != address(0), "PoolKeeper not set");

        /* Since adding these appropriately involves changing a lot of places in the test,
           we will add these two lines once tests are updated. In separate PRs
        address priceChanger = priceChangerDeployer.deploy(deploymentParameters.feeAddress);
        address poolCommittor = poolCommittorDeployer.deploy(deploymentParameters.quoteToken);
        */
        address priceChanger = address(this);
        address poolCommittor = address(this);
        LeveragedPool pool = LeveragedPool(
            Clones.cloneDeterministic(address(poolBase), keccak256(abi.encode(deploymentParameters.poolCode)))
        );
        emit DeployPool(address(pool), deploymentParameters.poolCode);

        ILeveragedPool.Initialization memory initialization = ILeveragedPool.Initialization(
            deploymentParameters.owner,
            deploymentParameters.keeper,
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
            priceChanger,
            poolCommittor,
            deploymentParameters.poolCode,
            deploymentParameters.frontRunningInterval,
            deploymentParameters.updateInterval,
            deploymentParameters.fee,
            deploymentParameters.leverageAmount,
            deploymentParameters.feeAddress,
            deploymentParameters.quoteToken
        );
        pool.initialize(initialization);

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

    function setPoolKeeper(address _poolKeeper) external onlyOwner {
        poolKeeper = IPoolKeeper(_poolKeeper);
    }
}
