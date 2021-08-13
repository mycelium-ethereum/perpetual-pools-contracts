// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPriceChanger.sol";
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
    address public override priceChanger;
    address public override poolCommitter;
    uint40 public override lastPriceTimestamp;

    string public poolCode;
    address public override oracleWrapper;
    address public override keeperOracle;

    // #### Functions

    function initialize(ILeveragedPool.Initialization calldata initialization) external override initializer {
        require(initialization._feeAddress != address(0), "Fee address cannot be 0 address");
        require(initialization._quoteToken != address(0), "Quote token cannot be 0 address");
        require(initialization._oracleWrapper != address(0), "Oracle wrapper cannot be 0 address");
        require(initialization._keeperOracle != address(0), "Keeper oracle cannot be 0 address");
        require(initialization._frontRunningInterval < initialization._updateInterval, "frontRunning > updateInterval");

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
        priceChanger = initialization._priceChanger;
        poolCommitter = initialization._poolCommitter;
        emit PoolInitialized(tokens[0], tokens[1], initialization._quoteToken, initialization._poolCode);
    }

    /**
     * @notice Execute a price change in the PriceChanger contract, then execute all commits in PoolCommitter
     */
    function poolUpkeep(int256 _oldPrice, int256 _newPrice) external override onlyKeeper {
        IPriceChanger _priceChanger = IPriceChanger(priceChanger);
        _priceChanger.executePriceChange(_oldPrice, _newPrice);
        lastPriceTimestamp = uint40(block.timestamp);
        IPoolCommitter(poolCommitter).executeAllCommitments();
    }

    function quoteTokenTransferFrom(
        address from,
        address to,
        uint256 amount
    ) external override onlyPriceChangerOrCommitter returns (bool) {
        return IERC20(quoteToken).transferFrom(from, to, amount);
    }

    function setNewPoolBalances(uint112 _longBalance, uint112 _shortBalance)
        external
        override
        onlyPriceChangerOrCommitter
    {
        longBalance = _longBalance;
        shortBalance = _shortBalance;
    }

    function mintTokens(
        uint256 token,
        uint256 amount,
        address minter
    ) external override onlyPriceChangerOrCommitter {
        require(token == 0 || token == 1, "Pool: token out of range");
        require(PoolToken(tokens[token]).mint(amount, minter), "Mint failed");
    }

    function burnTokens(
        uint256 token,
        uint256 amount,
        address burner
    ) external override onlyPriceChangerOrCommitter {
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
        require(account != address(0), "Invalid address");
        feeAddress = account;
    }

    function setKeeper(address _keeper) external override onlyGov {
        keeper = _keeper;
    }

    function transferGovernance(address _governance) external override onlyGov {
        governance = _governance;
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

    modifier onlyPriceChangerOrCommitter() {
        require(
            msg.sender == priceChanger || msg.sender == poolCommitter,
            "msg.sender not priceChanger or poolCommitter"
        );
        _;
    }

    modifier onlyGov() {
        require(msg.sender == governance, "msg.sender not governance");
        _;
    }
}
