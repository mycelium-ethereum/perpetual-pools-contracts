// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPriceChanger.sol";
import "./PoolToken.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./PoolSwapLibrary.sol";
import "../interfaces/IOracleWrapper.sol";

/*
@title Contract for executing price change logic
*/
contract PriceChanger is IPriceChanger, Ownable {
    // #### Globals

    bytes16 public fee;

    address public leveragedPool;
    address public feeAddress;
    address public factory;

    // #### Functions

    constructor(address _feeAddress, address _factory) {
        require(_feeAddress != address(0), "_feeAddress == address(0)");
        feeAddress = _feeAddress;
        factory = _factory;
    }

    /**
     * @notice Processes the effect of a price change. This involves transferring funds from the losing pool to the other.
     * @dev This function should be called by the Pool Keeper.
     * @dev This function should be secured with some form of access control
     * @param oldPrice The previously executed price
     * @param newPrice The price for the latest interval.
     */
    function executePriceChange(int256 oldPrice, int256 newPrice) external override onlyLeveragedPool {
        require(ILeveragedPool(leveragedPool).intervalPassed(), "Update interval hasn't passed");
        uint112 shortBalance = ILeveragedPool(leveragedPool).shortBalance();
        uint112 longBalance = ILeveragedPool(leveragedPool).longBalance();
        bytes16 leverageAmount = ILeveragedPool(leveragedPool).leverageAmount();

        // Calculate fees from long and short sides
        bytes16 sharedFee = fee;
        uint112 longFeeAmount = uint112(
            PoolSwapLibrary.convertDecimalToUInt(PoolSwapLibrary.multiplyDecimalByUInt(sharedFee, longBalance))
        );
        uint112 shortFeeAmount = uint112(
            PoolSwapLibrary.convertDecimalToUInt(PoolSwapLibrary.multiplyDecimalByUInt(sharedFee, shortBalance))
        );
        uint112 totalFeeAmount = 0;
        if (shortBalance >= shortFeeAmount) {
            shortBalance = shortBalance - shortFeeAmount;
            totalFeeAmount = totalFeeAmount + shortFeeAmount;
        }
        if (longBalance >= longFeeAmount) {
            longBalance = longBalance - longFeeAmount;
            totalFeeAmount = totalFeeAmount + longFeeAmount;
        }

        // Use the ratio to determine if the price increased or decreased and therefore which direction
        // the funds should be transferred towards.

        bytes16 ratio = PoolSwapLibrary.divInt(newPrice, oldPrice);
        int8 direction = PoolSwapLibrary.compareDecimals(ratio, PoolSwapLibrary.one);
        // Take into account the leverage
        bytes16 lossMultiplier = PoolSwapLibrary.getLossMultiplier(ratio, direction, leverageAmount);

        if (direction > 0 && shortBalance > 0) {
            // Move funds from short to long pair
            uint112 lossAmount = uint112(PoolSwapLibrary.getLossAmount(lossMultiplier, shortBalance));
            shortBalance = shortBalance - lossAmount;
            longBalance = longBalance + lossAmount;
            emit PriceChange(oldPrice, newPrice, lossAmount);
        } else if (direction < 0 && longBalance > 0) {
            // Move funds from long to short pair
            uint112 lossAmount = uint112(PoolSwapLibrary.getLossAmount(lossMultiplier, longBalance));
            shortBalance = shortBalance + lossAmount;
            longBalance = longBalance - lossAmount;
            emit PriceChange(oldPrice, newPrice, lossAmount);
        }
        require(
            ILeveragedPool(leveragedPool).quoteTokenTransferFrom(address(this), feeAddress, totalFeeAmount),
            "Fee transfer failed"
        );
        ILeveragedPool(leveragedPool).setNewPoolBalances(longBalance, shortBalance);
    }

    function updateFeeAddress(address account) external override onlyOwner {
        require(account != address(0), "Invalid address");
        feeAddress = account;
    }

    function setPool(address _leveragedPool) external override onlyFactory {
        leveragedPool = _leveragedPool;
    }

    // #### Modifiers
    modifier onlyLeveragedPool() {
        require(msg.sender == leveragedPool, "msg.sender not LeveragedPool");
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "msg.sender not factory");
        _;
    }
}
