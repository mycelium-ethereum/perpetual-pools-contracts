// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPriceChanger.sol";
import "../interfaces/IPoolCommittor.sol";
import "./PoolToken.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../vendors/SafeMath_40.sol";
import "../vendors/SafeMath_112.sol";
import "../vendors/SafeMath_128.sol";

import "./PoolSwapLibrary.sol";
import "../interfaces/IOracleWrapper.sol";

import "hardhat/console.sol";

/*
@title The pool controller contract
*/
contract LeveragedPool is ILeveragedPool, Initializable {
    using SafeMath_40 for uint40;
    using SafeMath_112 for uint112;
    using SafeMath_128 for uint128;

    // #### Globals

    // Each balance is the amount of quote tokens in the pair
    uint112 public override shortBalance;
    uint112 public override longBalance;
    uint32 public override frontRunningInterval;
    uint32 public override updateInterval;

    bytes16 public fee;
    bytes16 public leverageAmount;

    // Index 0 is the LONG token, index 1 is the SHORT token
    address[2] public tokens;

    address public owner;
    address public keeper;
    address public feeAddress;
    address public quoteToken;
    address public override priceChanger;
    address public override poolCommittor;
    uint40 public override lastPriceTimestamp;

    string public poolCode;
    address public override oracleWrapper;

    // #### Functions

    function initialize(ILeveragedPool.Initialization calldata initialization) external override initializer {
        require(initialization._feeAddress != address(0), "Fee address cannot be 0 address");
        require(initialization._quoteToken != address(0), "Quote token cannot be 0 address");
        require(initialization._oracleWrapper != address(0), "Oracle wrapper cannot be 0 address");
        require(initialization._frontRunningInterval < initialization._updateInterval, "frontRunning > updateInterval");
        transferOwnershipInitializer(initialization._owner);

        // Setup variables
        keeper = initialization._keeper;
        oracleWrapper = initialization._oracleWrapper;
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
        poolCommittor = initialization._poolCommittor;
        emit PoolInitialized(tokens[0], tokens[1], initialization._quoteToken, initialization._poolCode);
    }

    function poolUpkeep(int256 _oldPrice, int256 _newPrice) external override {
        IPriceChanger _priceChanger = IPriceChanger(priceChanger);
        _priceChanger.executePriceChange(_oldPrice, _newPrice);
        lastPriceTimestamp = uint40(block.timestamp);
        // TODO execute all commitments on upkeep is a separate PR.
        // IPoolCommittor(poolCommittor).executeAllCommits();
    }

    function quoteTokenTransferFrom(address from, address to, uint256 amount) external override onlyPriceChangerOrCommittor returns (bool) {
        return IERC20(quoteToken).transferFrom(from, to, amount);
    }

    function setNewPoolBalances(uint112 _longBalance, uint112 _shortBalance) external override onlyPriceChangerOrCommittor {
        longBalance = _longBalance;
        shortBalance = _shortBalance;
    }

    /**
     * @return true if the price was last updated more than updateInterval seconds ago
     */
    function intervalPassed() public view override returns (bool) {
        return block.timestamp >= lastPriceTimestamp.add(updateInterval);
    }

    function setKeeper(address _keeper) external override onlyOwner {
        keeper = _keeper;
    }

    function transferOwnershipInitializer(address _owner) internal initializer {
        owner = _owner;
    }

    function transferOwnership(address _owner) external override onlyOwner {
        owner = _owner;
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
    
    modifier onlyPriceChangerOrCommittor() {
        require(msg.sender == priceChanger || msg.sender == poolCommittor, "msg.sender not priceChanger or poolCommittor");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "msg.sender not owner");
        _;
    }
}
