// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "../interfaces/IPoolFactory.sol";
import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPoolCommitterDeployer.sol";
import "../interfaces/IPoolCommitter.sol";
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
    IPoolCommitterDeployer public poolCommitterDeployer;
    // default max leverage of 25
    uint16 public maxLeverage = 25;
    // contract address to receive protocol fees
    address feeReceiver;
    // default fee
    bytes16 public fee;

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
    constructor(address _poolCommitterDeployer, address _feeReceiver) {
        // Deploy base contracts
        pairTokenBase = new PoolToken();
        poolBase = new LeveragedPool();

        ILeveragedPool.Initialization memory baseInitialization = ILeveragedPool.Initialization(
            address(this),
            address(this),
            address(this),
            address(this),
            address(this),
            address(this),
            address(this),
            "BASE_POOL",
            1,
            2,
            0,
            1,
            address(this),
            address(this)
        );
        // Init bases
        poolBase.initialize(baseInitialization);
        poolCommitterDeployer = IPoolCommitterDeployer(_poolCommitterDeployer);

        pairTokenBase.initialize(address(this), "BASE_TOKEN", "BASE");
        feeReceiver = _feeReceiver;
    }

    function deployPool(PoolDeployment calldata deploymentParameters) external override returns (address) {
        address _poolKeeper = address(poolKeeper);
        require(_poolKeeper != address(0), "PoolKeeper not set");
        address poolCommitter = poolCommitterDeployer.deploy(address(this));
        require(
            deploymentParameters.leverageAmount >= 1 && deploymentParameters.leverageAmount <= maxLeverage,
            "PoolKeeper: leveraged amount invalid"
        );
        LeveragedPool pool = LeveragedPool(Clones.clone(address(poolBase)));
        address _pool = address(pool);
        emit DeployPool(_pool, deploymentParameters.poolName);

        address shortToken = deployPairToken(
            _pool,
            string(abi.encodePacked(deploymentParameters.poolName, "-LONG")),
            string(abi.encodePacked("L-", deploymentParameters.poolName))
        );
        address longToken = deployPairToken(
            _pool,
            string(abi.encodePacked(deploymentParameters.poolName, "-SHORT")),
            string(abi.encodePacked("S-", deploymentParameters.poolName))
        );
        ILeveragedPool.Initialization memory initialization = ILeveragedPool.Initialization(
            owner(), // governance is the owner of pools
            _poolKeeper,
            deploymentParameters.oracleWrapper,
            deploymentParameters.keeperOracle,
            shortToken,
            longToken,
            poolCommitter,
            deploymentParameters.poolName,
            deploymentParameters.frontRunningInterval,
            deploymentParameters.updateInterval,
            fee,
            deploymentParameters.leverageAmount,
            feeReceiver,
            deploymentParameters.quoteToken
        );
        // the following two function calls are both due to circular dependencies
        // approve the quote token on the pool commiter to finalise linking
        // this also stores the pool address in the commiter
        IPoolCommitter(poolCommitter).setQuoteAndPool(deploymentParameters.quoteToken, _pool);

        // finalise pool setup
        pool.initialize(initialization);
        poolKeeper.newPool(_pool);
        pools[numPools] = _pool;
        numPools += 1;
        isValidPool[_pool] = true;
        return _pool;
    }

    function deployPairToken(
        address owner,
        string memory name,
        string memory symbol
    ) internal returns (address) {
        PoolToken pairToken = PoolToken(Clones.clone(address(pairTokenBase)));
        pairToken.initialize(owner, name, symbol);

        return address(pairToken);
    }

    // todo -> do we want this to be changeable. This would mean this needs to be propogated to all pools
    // either we a) use a proxy and don't have a setter
    // b) go for versioned releases and start with a safety switch we can turn off
    function setPoolKeeper(address _poolKeeper) external override onlyOwner {
        poolKeeper = IPoolKeeper(_poolKeeper);
    }

    function setMaxLeverage(uint16 newMaxLeverage) external override onlyOwner {
        maxLeverage = newMaxLeverage;
    }

    function setFeeReceiver(address _feeReceiver) external override onlyOwner {
        feeReceiver = _feeReceiver;
    }

    function setFee(bytes16 _fee) external override onlyOwner {
        fee = _fee;
    }
}
