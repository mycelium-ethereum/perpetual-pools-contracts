// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;
import "abdk-libraries-solidity/ABDKMathQuad.sol";
import "../vendors/SafeMath_112.sol";
import "../implementation/PoolSwapLibrary.sol";

library PoolSwapLibraryMock {
    function getRatio(uint112 _numerator, uint112 _denominator) external pure returns (bytes16) {
		    return PoolSwapLibrary.getRatio(_numerator, _denominator);
    }

    function getAmountOut(bytes16 ratio, uint112 amountIn) external pure returns (uint112) {
		    return PoolSwapLibrary.getAmountOut(ratio, amountIn);
    }

    function compareDecimals(bytes16 x, bytes16 y) external pure returns (int8) {
        return PoolSwapLibrary.compareDecimals(x, y);
    }

    function convertUIntToDecimal(uint112 amount) external pure returns (bytes16) {
        return PoolSwapLibrary.convertUIntToDecimal(amount);
    }

    function convertDecimalToUInt(bytes16 ratio) external pure returns (uint256) {
        return PoolSwapLibrary.convertDecimalToUInt(ratio);
    }

    function multiplyDecimalByUInt(bytes16 a, uint256 b) external pure returns (bytes16) {
        return PoolSwapLibrary.multiplyDecimalByUInt(a, b);
    }

    function divInt(int256 a, int256 b) external pure returns (bytes16) {
        return PoolSwapLibrary.divInt(a, b);
    }

    function getLossMultiplier(
        bytes16 ratio,
        int8 direction,
        bytes16 leverage
    ) external pure returns (bytes16) {
		    return PoolSwapLibrary.getLossMultiplier(ratio, direction, leverage);
    }

    function getLossAmount(bytes16 lossMultiplier, uint112 balance) external pure returns (uint256) {
		    return PoolSwapLibrary.getLossAmount(lossMultiplier, balance);
    }

    function calculatePriceChangeParameters(
        int256 oldPrice,
        int256 newPrice,
        bytes16 fee,
        uint112 longBalance,
        uint112 shortBalance,
        bytes16 leverageAmount
    )
        external
        pure
        returns (
            int8 direction,
            bytes16 lossMultiplier,
            uint112 totalFeeAmount
        )
    {
		    return PoolSwapLibrary.calculatePriceChangeParameters(oldPrice, newPrice, fee, longBalance, shortBalance, leverageAmount);
    }
}