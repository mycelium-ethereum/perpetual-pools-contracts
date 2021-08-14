// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPoolCommitter.sol";
import "./PoolToken.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./PoolSwapLibrary.sol";
import "../interfaces/IOracleWrapper.sol";

/*
@title The pool controller contract
*/
contract LeveragedPool is ILeveragedPool, Initializable {
    // #### Globals

    // Each balance is the amount of quote tokens in the pair
    uint112 public override shortBalance;
    uint112 public override longBalance;
    uint32 public override frontRunningInterval;
    uint32 public override updateInterval;

    bytes16 public fee;
    bytes16 public override leverageAmount;

    // Index 0 is the LONG token, index 1 is the SHORT token
    address[2] public tokens;

    address public governance;
    address public keeper;
    address public feeAddress;
    address public override quoteToken;
    address public override poolCommitter;
    uint256 public override lastPriceTimestamp;

    string public poolCode;
    address public override oracleWrapper;
    address public override keeperOracle;

    // #### Functions

    function initialize(ILeveragedPool.Initialization calldata initialization) external override initializer {
        require(initialization._feeAddress != address(0), "Fee address cannot be 0 address");
        require(initialization._quoteToken != address(0), "Quote token cannot be 0 address");
        require(initialization._oracleWrapper != address(0), "Oracle wrapper cannot be 0 address");
        require(initialization._keeperOracle != address(0), "Keeper oracle cannot be 0 address");
        require(initialization._owner != address(0), "Owner cannot be 0 address");
        require(initialization._keeper != address(0), "Keeper cannot be 0 address");
        require(initialization._longToken != address(0), "Long token cannot be 0 address");
        require(initialization._shortToken != address(0), "Short token cannot be 0 address");
        require(initialization._poolCommitter != address(0), "PoolCommitter cannot be 0 address");
        require(initialization._frontRunningInterval < initialization._updateInterval, "frontRunning > updateInterval");

        require(
            PoolSwapLibrary.compareDecimals(initialization._fee, PoolSwapLibrary.one) == -1,
            "Fee is greater than 100%"
        );

        // set the owner of the pool. This is governance when deployed from the factory
        governance = initialization._owner;

        // Setup variables
        keeper = initialization._keeper;
        oracleWrapper = initialization._oracleWrapper;
        keeperOracle = initialization._keeperOracle;
        quoteToken = initialization._quoteToken;
        frontRunningInterval = initialization._frontRunningInterval;
        updateInterval = initialization._updateInterval;
        fee = initialization._fee;
        leverageAmount = PoolSwapLibrary.convertUIntToDecimal(initialization._leverageAmount);
        feeAddress = initialization._feeAddress;
        lastPriceTimestamp = uint40(block.timestamp);
        poolCode = initialization._poolCode;
        tokens[0] = initialization._longToken;
        tokens[1] = initialization._shortToken;
        poolCommitter = initialization._poolCommitter;
        emit PoolInitialized(
            initialization._longToken,
            initialization._shortToken,
            initialization._quoteToken,
            initialization._poolCode
        );
    }

    /**
     * @notice Execute a price change, then execute all commits in PoolCommitter
     */
    function poolUpkeep(int256 _oldPrice, int256 _newPrice) external override onlyKeeper {
        require(intervalPassed(), "Update interval hasn't passed");
        lastPriceTimestamp = uint40(block.timestamp);
        executePriceChange(_oldPrice, _newPrice);
        IPoolCommitter(poolCommitter).executeAllCommitments();
    }

    function executePriceChange(int256 _oldPrice, int256 _newPrice) internal {
        PoolSwapLibrary.PriceChangeData memory priceChangeData = PoolSwapLibrary.PriceChangeData(
            _oldPrice,
            _newPrice,
            longBalance,
            shortBalance,
            leverageAmount,
            fee
        );
        (uint112 newLongBalance, uint112 newShortBalance, uint112 totalFeeAmount) = PoolSwapLibrary
            .calculatePriceChange(priceChangeData);

        // Update pool balances
        longBalance = newLongBalance;
        shortBalance = newShortBalance;
        // Pay the fee
        IERC20(quoteToken).transferFrom(address(this), feeAddress, totalFeeAmount);
        emit PriceChange(_oldPrice, _newPrice);
    }

    function quoteTokenTransferFrom(
        address from,
        address to,
        uint256 amount
    ) external override onlyPoolCommitter returns (bool) {
        require(from != address(0), "From address cannot be 0 address");
        require(to != address(0), "To address cannot be 0 address");
        return IERC20(quoteToken).transferFrom(from, to, amount);
    }

    function setNewPoolBalances(uint112 _longBalance, uint112 _shortBalance) external override onlyPoolCommitter {
        longBalance = _longBalance;
        shortBalance = _shortBalance;
    }

    function mintTokens(
        uint256 token,
        uint256 amount,
        address minter
    ) external override onlyPoolCommitter {
        require(minter != address(0), "Minter address cannot be 0 address");
        require(token == 0 || token == 1, "Pool: token out of range");
        require(PoolToken(tokens[token]).mint(amount, minter), "Mint failed");
    }

    function burnTokens(
        uint256 token,
        uint256 amount,
        address burner
    ) external override onlyPoolCommitter {
        require(burner != address(0), "Burner address cannot be 0 address");
        require(token == 0 || token == 1, "Pool: token out of range");
        require(PoolToken(tokens[token]).burn(amount, burner), "Burn failed");
    }

    /**
     * @return true if the price was last updated more than updateInterval seconds ago
     */
    function intervalPassed() public view override returns (bool) {
        return block.timestamp >= lastPriceTimestamp + updateInterval;
    }

    function updateFeeAddress(address account) external override onlyGov {
        require(account != address(0), "Account cannot be 0 address");
        address oldFeeAddress = feeAddress;
        feeAddress = account;
        emit FeeAddressUpdated(oldFeeAddress, feeAddress);
    }

    function setKeeper(address _keeper) external override onlyGov {
        require(_keeper != address(0), "Keeper address cannot be 0 address");
        address oldKeeper = keeper;
        keeper = _keeper;
        emit KeeperAddressChanged(oldKeeper, keeper);
    }

    function transferGovernance(address _governance) external override onlyGov {
        require(_governance != address(0), "Governance address cannot be 0 address");
        address oldGovAddress = governance;
        governance = _governance;
        emit GovernanceAddressChanged(oldGovAddress, governance);
    }

    /**
     * @return The price of the pool's feed oracle
     */
    function getOraclePrice() public view override returns (int256) {
        return IOracleWrapper(oracleWrapper).getPrice();
    }

    function poolTokens() external view override returns (address[2] memory) {
        return tokens;
    }

    // #### Modifiers
    modifier onlyKeeper() {
        require(msg.sender == keeper, "msg.sender not keeper");
        _;
    }

    modifier onlyPoolCommitter() {
        require(msg.sender == poolCommitter, "msg.sender not poolCommitter");
        _;
    }

    modifier onlyGov() {
        require(msg.sender == governance, "msg.sender not governance");
        _;
    }
}
