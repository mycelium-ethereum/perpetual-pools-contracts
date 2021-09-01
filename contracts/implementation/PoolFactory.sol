// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "../interfaces/IPoolFactory.sol";
import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPoolCommitterDeployer.sol";
import "../interfaces/IPoolCommitter.sol";
import "../interfaces/IERC20DecimalsWrapper.sol";
import "./LeveragedPool.sol";
import "./PoolToken.sol";
import "./PoolKeeper.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title The pool factory contract
contract PoolFactory is IPoolFactory, Ownable {
    // #### Globals
    PoolToken public pairTokenBase;
    LeveragedPool public poolBase;
    IPoolKeeper public poolKeeper;
    IPoolCommitterDeployer public poolCommitterDeployer;

    // Default max leverage of 10
    uint16 public maxLeverage = 10;
    // Contract address to receive protocol fees
    address feeReceiver;
    // Default fee; quadruple precision (128 bit) floating point number (64.64)
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
    constructor(address _feeReceiver) {
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
            15,
            30,
            0,
            1,
            address(this),
            address(this)
        );
        // Init bases
        poolBase.initialize(baseInitialization);

        pairTokenBase.initialize(address(this), "BASE_TOKEN", "BASE");
        feeReceiver = _feeReceiver;
    }

    /**
     * @notice Deploy a leveraged pool with given parameters
     * @param deploymentParameters Deployment parameters of the market. Some may be reconfigurable
     * @return Address of the created pool
     */
    function deployPool(PoolDeployment calldata deploymentParameters) external override onlyGov returns (address) {
        address _poolKeeper = address(poolKeeper);
        require(_poolKeeper != address(0), "PoolKeeper not set");
        require(address(poolCommitterDeployer) != address(0), "PoolCommitterDeployer not set");
        address poolCommitter = poolCommitterDeployer.deploy(deploymentParameters.minimumCommitSize, deploymentParameters.maximumCommitQueueLength);
        require(
            deploymentParameters.leverageAmount >= 1 && deploymentParameters.leverageAmount <= maxLeverage,
            "PoolKeeper: leveraged amount invalid"
        );
        require(IERC20DecimalsWrapper(deploymentParameters.quoteToken).decimals() <= 18, "Token decimals > 18");
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
            owner(), // governance is the owner of pools -- if this changes, `onlyGov` breaks
            _poolKeeper,
            deploymentParameters.oracleWrapper,
            deploymentParameters.settlementEthOracle,
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

    /**
     * @notice Deploy a contract for pool tokens
     * @param name Name of the token
     * @param symbol Symbol of the token
     * @return Address of the pool token
     */
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
        require(_poolKeeper != address(0), "address cannot be null");
        poolKeeper = IPoolKeeper(_poolKeeper);
    }

    function setMaxLeverage(uint16 newMaxLeverage) external override onlyOwner {
        maxLeverage = newMaxLeverage;
    }

    function setFeeReceiver(address _feeReceiver) external override onlyOwner {
        require(_feeReceiver != address(0), "address cannot be null");
        feeReceiver = _feeReceiver;
    }

    function setFee(bytes16 _fee) external override onlyOwner {
        fee = _fee;
    }

    function setPoolCommitterDeployer(address _poolCommitterDeployer) external override onlyOwner {
        require(_poolCommitterDeployer != address(0), "address cannot be null");
        poolCommitterDeployer = IPoolCommitterDeployer(_poolCommitterDeployer);
    }

    modifier onlyGov() {
        require(msg.sender == owner(), "msg.sender not governance");
        _;
    }
}
