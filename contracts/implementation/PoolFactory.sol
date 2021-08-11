// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolFactory.sol";
import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPriceChangerDeployer.sol";
import "../interfaces/IPoolCommitterDeployer.sol";
import "../interfaces/IPoolCommitter.sol";
import "../interfaces/IPriceChanger.sol";
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
    IPoolCommitterDeployer public poolCommitterDeployer;
    // default max leverage of 25
    uint16 public maxLeverage = 25;
    // contract address to receive protocol fees
    address feeReceiver;
    // default fee
    bytes16 public fee;

    /**
     * @notice Format: keccack(leverage, quoteToken, oracle) => is taken
     * @dev ensures that the factory does not deterministically deploy pools that already exist
     */
    mapping(bytes32 => bool) public override poolIdTaken;

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
    constructor(address _poolCommitterDeployer, address _priceChangerDeployer, address _feeReceiver) {
        // Deploy base contracts
        pairTokenBase = new PoolToken();
        poolBase = new LeveragedPool();

        ILeveragedPool.Initialization memory baseInitialization = ILeveragedPool.Initialization(
            address(this),
            address(0),
            address(this),
            address(this),
            address(0),
            address(0),
            address(0),
            address(0),
            "BASE_POOL",
            1,
            2,
            0,
            0,
            address(this),
            address(this)
        );
        // Init bases
        poolBase.initialize(baseInitialization);
        poolCommitterDeployer = IPoolCommitterDeployer(_poolCommitterDeployer);
        priceChangerDeployer = IPriceChangerDeployer(_priceChangerDeployer);

        pairTokenBase.initialize(address(this), "BASE_TOKEN", "BASE");
        feeReceiver = _feeReceiver;
    }

    function deployPool(PoolDeployment calldata deploymentParameters) external override returns (address) {
        require(address(poolKeeper) != address(0), "PoolKeeper not set");

        address priceChanger = priceChangerDeployer.deploy(feeReceiver, address(this));
        address poolCommitter = poolCommitterDeployer.deploy(address(this));
        bytes32 uniquePoolId = keccak256(
            abi.encode(
                deploymentParameters.leverageAmount,
                deploymentParameters.quoteToken,
                deploymentParameters.oracleWrapper
            )
        );
        require(!poolIdTaken[uniquePoolId], "Pool ID in use");
        require(
            deploymentParameters.leverageAmount >= 1 && deploymentParameters.leverageAmount <= maxLeverage,
            "PoolKeeper: leveraged amount invalid"
        );
        LeveragedPool pool = LeveragedPool(
            // pools are unique based on poolCode, quoteToken and oracle
            Clones.cloneDeterministic(address(poolBase), uniquePoolId)
        );
        address _pool = address(pool);
        emit DeployPool(_pool, deploymentParameters.poolCode);

        ILeveragedPool.Initialization memory initialization = ILeveragedPool.Initialization(
            owner(), // governance is the owner of pools
            address(poolKeeper),
            deploymentParameters.oracleWrapper,
            deploymentParameters.keeperOracle,
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
            priceChanger,
            poolCommitter,
            deploymentParameters.poolCode,
            deploymentParameters.frontRunningInterval,
            deploymentParameters.updateInterval,
            fee,
            deploymentParameters.leverageAmount,
            feeReceiver,
            deploymentParameters.quoteToken
        );
        // the following two function calls are both due to circular dependencies
        // aprove the quote token on the pool commiter to finalise linking
        // this also stores the pool address in the commiter
        IPoolCommitter(poolCommitter).setQuoteAndPool(deploymentParameters.quoteToken, _pool);

        // link in the pool to the priceChanger
        IPriceChanger(priceChanger).setPool(_pool);

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
