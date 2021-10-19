//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

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
    address public immutable pairTokenBaseAddress;
    LeveragedPool public poolBase;
    address public immutable poolBaseAddress;
    IPoolKeeper public poolKeeper;
    IPoolCommitterDeployer public poolCommitterDeployer;

    // Default max leverage of 10
    uint16 public maxLeverage = 10;
    // This is required because we must pass along *some* value for decimal
    // precision to the base pool tokens as we use the Cloneable pattern
    uint8 constant DEFAULT_NUM_DECIMALS = 18;
    // Contract address to receive protocol fees
    address public feeReceiver;
    // Default fee; Fee value as a decimal multiplied by 10^18. For example, 0.5% is represented as 0.5 * 10^18
    uint256 public fee;

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
        pairTokenBase = new PoolToken(DEFAULT_NUM_DECIMALS);
        pairTokenBaseAddress = address(pairTokenBase);
        poolBase = new LeveragedPool();
        poolBaseAddress = address(poolBase);

        ILeveragedPool.Initialization memory baseInitialization = ILeveragedPool.Initialization(
            address(this),
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

        pairTokenBase.initialize(address(this), "BASE_TOKEN", "BASE", DEFAULT_NUM_DECIMALS);
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

        address poolCommitter = poolCommitterDeployer.deploy(deploymentParameters.invariantCheckContract);
        require(
            deploymentParameters.leverageAmount >= 1 && deploymentParameters.leverageAmount <= maxLeverage,
            "PoolKeeper: leveraged amount invalid"
        );
        require(IERC20DecimalsWrapper(deploymentParameters.quoteToken).decimals() <= 18, "Token decimals > 18");

        LeveragedPool pool = LeveragedPool(Clones.clone(poolBaseAddress));
        address _pool = address(pool);
        emit DeployPool(_pool, deploymentParameters.poolName);

        string memory leverage = uint2str(deploymentParameters.leverageAmount);
        string memory longString = string(abi.encodePacked(leverage, "L-", deploymentParameters.poolName));
        string memory shortString = string(abi.encodePacked(leverage, "S-", deploymentParameters.poolName));

        uint8 settlementDecimals = IERC20DecimalsWrapper(deploymentParameters.quoteToken).decimals();
        address shortToken = deployPairToken(_pool, shortString, shortString, settlementDecimals);
        address longToken = deployPairToken(_pool, longString, longString, settlementDecimals);
        ILeveragedPool.Initialization memory initialization = ILeveragedPool.Initialization({
            _owner: owner(), // governance is the owner of pools -- if this changes, `onlyGov` breaks
            _keeper: _poolKeeper,
            _oracleWrapper: deploymentParameters.oracleWrapper,
            _settlementEthOracle: deploymentParameters.settlementEthOracle,
            _longToken: longToken,
            _shortToken: shortToken,
            _poolCommitter: poolCommitter,
            _invariantCheckContract: deploymentParameters.invariantCheckContract,
            _poolName: string(abi.encodePacked(leverage, "-", deploymentParameters.poolName)),
            _frontRunningInterval: deploymentParameters.frontRunningInterval,
            _updateInterval: deploymentParameters.updateInterval,
            _fee: fee,
            _leverageAmount: deploymentParameters.leverageAmount,
            _feeAddress: feeReceiver,
            _quoteToken: deploymentParameters.quoteToken
        });

        // approve the quote token on the pool committer to finalise linking
        // this also stores the pool address in the committer
        // finalise pool setup
        pool.initialize(initialization);
        // approve the quote token on the pool commiter to finalise linking
        // this also stores the pool address in the commiter
        IPoolCommitter(poolCommitter).setQuoteAndPool(deploymentParameters.quoteToken, _pool);
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
     * @param decimals Number of decimal places to be supported
     * @return Address of the pool token
     */
    function deployPairToken(
        address owner,
        string memory name,
        string memory symbol,
        uint8 decimals
    ) internal returns (address) {
        PoolToken pairToken = PoolToken(Clones.clone(pairTokenBaseAddress));
        pairToken.initialize(owner, name, symbol, decimals);

        return address(pairToken);
    }

    function setPoolKeeper(address _poolKeeper) external override onlyOwner {
        require(_poolKeeper != address(0), "address cannot be null");
        poolKeeper = IPoolKeeper(_poolKeeper);
    }

    function setMaxLeverage(uint16 newMaxLeverage) external override onlyOwner {
        require(newMaxLeverage > 0, "Maximum leverage must be non-zero");
        maxLeverage = newMaxLeverage;
    }

    function setFeeReceiver(address _feeReceiver) external override onlyOwner {
        require(_feeReceiver != address(0), "address cannot be null");
        feeReceiver = _feeReceiver;
    }

    /**
     * @notice Set the fee amount. This is a percentage multiplied by 10^18.
     *         e.g. 5% is 0.05 * 10^18
     * @param _fee The fee amount as a percentage multiplied by 10^18
     */
    function setFee(uint256 _fee) external override onlyOwner {
        fee = _fee;
    }

    function setPoolCommitterDeployer(address _poolCommitterDeployer) external override onlyOwner {
        require(_poolCommitterDeployer != address(0), "address cannot be null");
        poolCommitterDeployer = IPoolCommitterDeployer(_poolCommitterDeployer);
    }

    function getOwner() external view override returns (address) {
        return owner();
    }

    /**
     * @notice Converts a uint to a str
     * @dev Assumes ASCII strings
     * @return raw string representation of the uint
     */
    function uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - (_i / 10) * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }

    modifier onlyGov() {
        require(msg.sender == owner(), "msg.sender not governance");
        _;
    }
}
