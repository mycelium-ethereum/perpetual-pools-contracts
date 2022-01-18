//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IPoolFactory.sol";
import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPoolCommitter.sol";
import "../interfaces/IERC20DecimalsWrapper.sol";
import "../interfaces/IAutoClaim.sol";
import "./LeveragedPool.sol";
import "./PoolToken.sol";
import "./PoolKeeper.sol";
import "./PoolCommitter.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title The pool factory contract
contract PoolFactory is IPoolFactory, Ownable {
    // #### Globals
    PoolToken public pairTokenBase;
    address public immutable pairTokenBaseAddress;
    LeveragedPool public poolBase;
    address public immutable poolBaseAddress;
    IPoolKeeper public poolKeeper;
    PoolCommitter public poolCommitterBase;
    address public immutable poolCommitterBaseAddress;

    address public autoClaim;

    // Contract address to receive protocol fees
    address public feeReceiver;
    // Default fee, annualised; Fee value as a decimal multiplied by 10^18. For example, 50% is represented as 0.5 * 10^18
    uint256 public fee;
    // Percent of fees that go to secondary fee address if applicable.
    uint256 public secondaryFeeSplitPercent = 10;
    // The fee taken for each mint and burn. Fee value as a decimal multiplied by 10^18. For example, 50% is represented as 0.5 * 10^18
    uint256 public mintingFee;
    uint256 public burningFee;

    // This is required because we must pass along *some* value for decimal
    // precision to the base pool tokens as we use the Cloneable pattern
    uint8 constant DEFAULT_NUM_DECIMALS = 18;
    uint8 constant MAX_DECIMALS = DEFAULT_NUM_DECIMALS;
    // Considering leap year thus using 365.2425 days per year
    uint32 constant DAYS_PER_LEAP_YEAR = 365.2425 days;
    // Default max leverage of 10
    uint16 public maxLeverage = 10;

    /**
     * @notice Format: Pool counter => pool address
     */
    mapping(uint256 => address) public override pools;
    uint256 public override numPools;

    /**
     * @notice Format: Pool address => validity
     */
    mapping(address => bool) public override isValidPool;

    /**
     * @notice Format: PoolCommitter address => validity
     */
    mapping(address => bool) public override isValidPoolCommitter;

    // #### Functions
    constructor(address _feeReceiver) {
        require(_feeReceiver != address(0), "Address cannot be null");

        // Deploy base contracts
        pairTokenBase = new PoolToken(DEFAULT_NUM_DECIMALS);
        pairTokenBaseAddress = address(pairTokenBase);
        poolBase = new LeveragedPool();
        poolBaseAddress = address(poolBase);
        poolCommitterBase = new PoolCommitter();
        poolCommitterBaseAddress = address(poolCommitterBase);

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
            address(0),
            address(this),
            secondaryFeeSplitPercent
        );
        // Init bases
        poolBase.initialize(baseInitialization);
        pairTokenBase.initialize(address(this), "BASE_TOKEN", "BASE", DEFAULT_NUM_DECIMALS);
        feeReceiver = _feeReceiver;
    }

    /**
     * @notice Deploy a leveraged pool and its committer/pool tokens with given parameters
     * @param deploymentParameters Deployment parameters of the market. Some may be reconfigurable.
     * @return Address of the created pool
     * @dev Throws if pool keeper is null
     * @dev Throws if deployer does not own the oracle wrapper
     * @dev Throws if leverage amount is invalid
     * @dev Throws if decimal precision is too high (i.e., greater than `MAX_DECIMALS`)
     */
    function deployPool(PoolDeployment calldata deploymentParameters) external override returns (address) {
        address _poolKeeper = address(poolKeeper);
        require(_poolKeeper != address(0), "PoolKeeper not set");
        require(
            IOracleWrapper(deploymentParameters.oracleWrapper).deployer() == msg.sender,
            "Deployer must be oracle wrapper owner"
        );

        bytes32 uniquePoolHash = keccak256(
            abi.encode(
                deploymentParameters.leverageAmount,
                deploymentParameters.quoteToken,
                deploymentParameters.oracleWrapper
            )
        );

        PoolCommitter poolCommitter = PoolCommitter(
            Clones.cloneDeterministic(poolCommitterBaseAddress, uniquePoolHash)
        );
        poolCommitter.initialize(
            address(this),
            deploymentParameters.invariantCheckContract,
            autoClaim,
            mintingFee,
            burningFee
        );
        address poolCommitterAddress = address(poolCommitter);

        require(
            deploymentParameters.leverageAmount >= 1 && deploymentParameters.leverageAmount <= maxLeverage,
            "PoolKeeper: leveraged amount invalid"
        );
        require(
            IERC20DecimalsWrapper(deploymentParameters.quoteToken).decimals() <= MAX_DECIMALS,
            "Decimal precision too high"
        );

        LeveragedPool pool = LeveragedPool(Clones.cloneDeterministic(poolBaseAddress, uniquePoolHash));
        address _pool = address(pool);
        emit DeployPool(_pool, poolCommitterAddress, deploymentParameters.poolName);

        string memory leverage = Strings.toString(deploymentParameters.leverageAmount);

        ILeveragedPool.Initialization memory initialization = ILeveragedPool.Initialization({
            _owner: owner(), // governance is the owner of pools -- if this changes, `onlyGov` breaks
            _keeper: _poolKeeper,
            _oracleWrapper: deploymentParameters.oracleWrapper,
            _settlementEthOracle: deploymentParameters.settlementEthOracle,
            _longToken: deployPairToken(_pool, leverage, deploymentParameters, "L-"),
            _shortToken: deployPairToken(_pool, leverage, deploymentParameters, "S-"),
            _poolCommitter: poolCommitterAddress,
            _invariantCheckContract: deploymentParameters.invariantCheckContract,
            _poolName: string(abi.encodePacked(leverage, "-", deploymentParameters.poolName)),
            _frontRunningInterval: deploymentParameters.frontRunningInterval,
            _updateInterval: deploymentParameters.updateInterval,
            _fee: (fee * deploymentParameters.updateInterval) / (DAYS_PER_LEAP_YEAR),
            _leverageAmount: deploymentParameters.leverageAmount,
            _feeAddress: feeReceiver,
            _secondaryFeeAddress: msg.sender,
            _quoteToken: deploymentParameters.quoteToken,
            _secondaryFeeSplitPercent: secondaryFeeSplitPercent
        });

        // approve the quote token on the pool committer to finalise linking
        // this also stores the pool address in the committer
        // finalise pool setup
        pool.initialize(initialization);
        // approve the quote token on the pool commiter to finalise linking
        // this also stores the pool address in the commiter
        IPoolCommitter(poolCommitterAddress).setQuoteAndPool(deploymentParameters.quoteToken, _pool);
        poolKeeper.newPool(_pool);
        pools[numPools] = _pool;
        numPools += 1;
        isValidPool[_pool] = true;
        isValidPoolCommitter[poolCommitterAddress] = true;
        return _pool;
    }

    /**
     * @notice Deploy a contract for pool tokens
     * @param leverage Amount of leverage for pool
     * @param deploymentParameters Deployment parameters for parent function
     * @param direction Long or short token, L- or S-
     * @return Address of the pool token
     */
    function deployPairToken(
        address poolOwner,
        string memory leverage,
        PoolDeployment memory deploymentParameters,
        string memory direction
    ) internal returns (address) {
        string memory poolNameAndSymbol = string(abi.encodePacked(leverage, direction, deploymentParameters.poolName));
        uint8 settlementDecimals = IERC20DecimalsWrapper(deploymentParameters.quoteToken).decimals();
        bytes32 uniqueTokenHash = keccak256(
            abi.encode(
                deploymentParameters.leverageAmount,
                deploymentParameters.quoteToken,
                deploymentParameters.oracleWrapper,
                direction
            )
        );

        PoolToken pairToken = PoolToken(Clones.cloneDeterministic(pairTokenBaseAddress, uniqueTokenHash));
        pairToken.initialize(poolOwner, poolNameAndSymbol, poolNameAndSymbol, settlementDecimals);
        return address(pairToken);
    }

    /**
     * @notice Sets the address of the associated `PoolKeeper` contract
     * @param _poolKeeper Address of the `PoolKeeper`
     * @dev Throws if provided address is null
     * @dev Only callable by the owner
     */
    function setPoolKeeper(address _poolKeeper) external override onlyOwner {
        require(_poolKeeper != address(0), "address cannot be null");
        poolKeeper = IPoolKeeper(_poolKeeper);
    }

    /**
     * @notice Sets the address of the associated `AutoClaim` contract
     * @param _autoClaim Address of the `AutoClaim`
     * @dev Throws if provided address is null
     * @dev Only callable by the owner
     */
    function setAutoClaim(address _autoClaim) external override onlyOwner {
        require(_autoClaim != address(0), "address cannot be null");
        autoClaim = _autoClaim;
    }

    /**
     * @notice Sets the maximum leverage
     * @param newMaxLeverage Maximum leverage permitted for all pools
     * @dev Throws if provided maximum leverage is non-positive
     * @dev Only callable by the owner
     */
    function setMaxLeverage(uint16 newMaxLeverage) external override onlyOwner {
        require(newMaxLeverage > 0, "Maximum leverage must be non-zero");
        maxLeverage = newMaxLeverage;
    }

    /**
     * @notice Sets the primary fee receiver of deployed Leveraged pools.
     * @param _feeReceiver address of fee receiver
     * @dev Only callable by the owner of this contract
     * @dev This fuction does not change anything for already deployed pools, only pools deployed after the change
     */
    function setFeeReceiver(address _feeReceiver) external override onlyOwner {
        require(_feeReceiver != address(0), "address cannot be null");
        feeReceiver = _feeReceiver;
    }

    /**
     * @notice Sets the proportion of fees to be split to the nominated secondary fees recipient
     * @param newFeePercent Proportion of fees to split
     * @dev Only callable by the owner of this contract
     * @dev Throws if `newFeePercent` exceeds 100
     */
    function setSecondaryFeeSplitPercent(uint256 newFeePercent) external override onlyOwner {
        require(newFeePercent <= 100, "Secondary fee split cannot exceed 100%");
        secondaryFeeSplitPercent = newFeePercent;
    }

    /**
     * @notice Set the yearly fee amount. The max yearly fee is 10%
     * @dev This is a percentage in WAD; multiplied by 10^18 e.g. 5% is 0.05 * 10^18
     * @param _fee The fee amount as a percentage
     * @dev Throws if fee is greater than 10%
     */
    function setFee(uint256 _fee) external override onlyOwner {
        require(_fee <= 0.1e18, "Fee cannot be > 10%");
        fee = _fee;
    }

    /**
     * @notice Set the minting and burning fee amount. The max yearly fee is 10%
     * @dev This is a percentage in WAD; multiplied by 10^18 e.g. 5% is 0.05 * 10^18
     * @param _mintingFee The fee amount for mints
     * @param _burningFee The fee amount for burns
     * @dev Only callable by the owner of this contract
     * @dev Throws if minting fee is greater than 10%
     * @dev Throws if burning fee is greater than 10%
     */
    function setMintAndBurnFee(uint256 _mintingFee, uint256 _burningFee) external override onlyOwner {
        require(_mintingFee <= 0.1e18, "Fee cannot be > 10%");
        require(_burningFee <= 0.1e18, "Fee cannot be > 10%");
        mintingFee = _mintingFee;
        burningFee = _burningFee;
    }

    /*
     * @notice Returns the address that owns this contract
     * @return Address of the owner
     * @dev Required due to the `IPoolFactory` interface
     */
    function getOwner() external view override returns (address) {
        return owner();
    }

    /**
     * @notice Ensures that the caller is the designated governance address
     */
    modifier onlyGov() {
        require(msg.sender == owner(), "msg.sender not governance");
        _;
    }
}
