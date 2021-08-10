// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;
import "abdk-libraries-solidity/ABDKMathQuad.sol";

library PoolSwapLibrary {
    bytes16 public constant one = 0x3fff0000000000000000000000000000;
    bytes16 public constant zero = 0x00000000000000000000000000000000;

    /**
    @notice Calculates the ratio between two numbers
    @dev Rounds any overflow towards 0. If either parameter is zero, the ratio is 0.
    @param _numerator The "parts per" side of the equation. If this is zero, the ratio is zero
    @param _denominator The "per part" side of the equation. If this is zero, the ratio is zero
    @return the ratio, as an ABDKMathQuad number (IEEE 754 quadruple precision floating point)
   */
    function getRatio(uint112 _numerator, uint112 _denominator) external pure returns (bytes16) {
        // Catch the divide by zero error.
        if (_denominator == 0) {
            return 0;
        }
        return ABDKMathQuad.div(ABDKMathQuad.fromUInt(_numerator), ABDKMathQuad.fromUInt(_denominator));
    }

    /**
    @notice Gets the amount of tokens a user is entitled to according to the ratio
    @dev This is useful for getting the amount of pool tokens to mint, and the amount of quote tokens to remit when minting and burning. Can also be used to provide the user with an estimate of their commit results.
    @param ratio The ratio to calculate. Use the getRatio function to calculate this
    @param amountIn The amount of tokens the user is providing. This can be quote tokens or pool tokens.
    @return The amount of tokens to mint/remit to the user.
   */
    function getAmountOut(bytes16 ratio, uint112 amountIn) external pure returns (uint112) {
        require(amountIn > 0, "Invalid amount");
        if (ABDKMathQuad.cmp(ratio, 0) == 0 || ABDKMathQuad.cmp(ratio, bytes16("0x1")) == 0) {
            return amountIn;
        }
        return uint112(ABDKMathQuad.toUInt(ABDKMathQuad.mul(ratio, ABDKMathQuad.fromUInt(amountIn))));
    }

    /**
    @notice Compares two decimal numbers
    @param x The first number to compare
    @param y The second number to compare
    @return -1 if x < y, 0 if x = y, or 1 if x > y
   */
    function compareDecimals(bytes16 x, bytes16 y) external pure returns (int8) {
        return ABDKMathQuad.cmp(x, y);
    }

    /**
    @notice Converts an integer value to a compatible decimal value
    @param amount The amount to convert
    @return The amount as a IEEE754 quadruple precision number
  */
    function convertUIntToDecimal(uint112 amount) external pure returns (bytes16) {
        return ABDKMathQuad.fromUInt(uint256(amount));
    }

    /**
    @notice Converts a raw decimal value to a more readable uint256 value
    @param ratio The value to convert
    @return The converted value
  */
    function convertDecimalToUInt(bytes16 ratio) external pure returns (uint256) {
        return ABDKMathQuad.toUInt(ratio);
    }

    /**
    @notice Multiplies a decimal and an unsigned integer
    @param a The first term
    @param b The second term
    @return The product of a*b as a decimal
  */
    function multiplyDecimalByUInt(bytes16 a, uint256 b) external pure returns (bytes16) {
        return ABDKMathQuad.mul(a, ABDKMathQuad.fromUInt(b));
    }

    /**
    @notice Divides two integers
    @param a The dividend
    @param b The divisor
    @return The qotient 
  */
    function divInt(int256 a, int256 b) external pure returns (bytes16) {
        return ABDKMathQuad.div(ABDKMathQuad.fromInt(a), ABDKMathQuad.fromInt(b));
    }

    /**
    @notice Calculates the loss multiplier to apply to the losing pool. Includes the power leverage
    @param ratio The ratio of new price to old price
    @param direction The direction of the change. -1 if it's decreased, 0 if it hasn't changed, and 1 if it's increased.
    @param leverage The amount of leverage to apply
    @return The multiplier
  */
    function getLossMultiplier(
        bytes16 ratio,
        int8 direction,
        bytes16 leverage
    ) external pure returns (bytes16) {
        // If decreased:  2 ^ (leverage * log2[(1 * new/old) + [(0 * 1) / new/old]])
        //              = 2 ^ (leverage * log2[(new/old)])
        // If increased:  2 ^ (leverage * log2[(0 * new/old) + [(1 * 1) / new/old]])
        //              = 2 ^ (leverage * log2([1 / new/old]))
        //              = 2 ^ (leverage * log2([old/new]))
        return
            ABDKMathQuad.pow_2(
                ABDKMathQuad.mul(
                    leverage,
                    ABDKMathQuad.log_2(
                        ABDKMathQuad.add(
                            ABDKMathQuad.mul(direction < 0 ? one : zero, ratio),
                            ABDKMathQuad.div(ABDKMathQuad.mul(direction >= 0 ? one : zero, one), ratio)
                        )
                    )
                )
            );
    }

    /**
    @notice Calculates the amount to take from the losing pool.
    @param lossMultiplier The multiplier to use
    @param balance The balance of the losing pool
  */
    function getLossAmount(bytes16 lossMultiplier, uint112 balance) external pure returns (uint256) {
        return
            ABDKMathQuad.toUInt(
                ABDKMathQuad.mul(ABDKMathQuad.sub(one, lossMultiplier), ABDKMathQuad.fromUInt(balance))
            );
    }
}
