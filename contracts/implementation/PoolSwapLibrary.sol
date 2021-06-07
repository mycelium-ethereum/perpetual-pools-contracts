// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;
import "abdk-libraries-solidity/ABDKMathQuad.sol";

library PoolSwapLibrary {
  /**
    @notice Calculates the ratio between two numbers
    @dev Rounds any overflow towards 0. If either parameter is zero, the ratio is 0.
    @param _numerator The "parts per" side of the equation. If this is zero, the ratio is zero
    @param _denominator The "per part" side of the equation. If this is zero, the ratio is zero
    @return the ratio, as an ABDKMathQuad number (IEEE 754 quadruple precision floating point)
   */
  function getRatio(uint112 _numerator, uint112 _denominator)
    external
    pure
    returns (bytes16)
  {
    // Catch the divide by zero error.
    if (_denominator == 0) {
      return 0;
    }
    return
      ABDKMathQuad.div(
        ABDKMathQuad.fromUInt(_numerator),
        ABDKMathQuad.fromUInt(_denominator)
      );
  }

  /**
    @notice Compares two ratios
    @param x The first ratio to compare
    @param y The second ratio to compare
    @return -1 if x < y, 0 if x = y, or 1 if x > y
   */
  function compareRatios(bytes16 x, bytes16 y) external pure returns (int8) {
    return ABDKMathQuad.cmp(x, y);
  }

  /**
    @notice Converts an integer value to a compatible value for use as a ratio
    @param amount The amount to convert
    @return The amount as a IEEE754 quadruple precision number
 */
  function convertUIntToRatio(uint112 amount) external pure returns (bytes16) {
    return ABDKMathQuad.fromUInt(uint256(amount));
  }

  /**
    @notice Converts a raw ratio value to a more readable uint256 value
    @param ratio The ratio to convert
    @return The converted value
 */
  function convertRatioToUInt(bytes16 ratio) external pure returns (uint256) {
    return ABDKMathQuad.toUInt(ratio);
  }

  /**
    @notice Gets the amount of tokens a user is entitled to according to the ratio
    @dev This is useful for getting the amount of pool tokens to mint, and the amount of quote tokens to remit when minting and burning. Can also be used to provide the user with an estimate of their commit results.
    @param ratio The ratio to calculate. Use the getRatio function to calculate this
    @param amountIn The amount of tokens the user is providing. This can be quote tokens or pool tokens.
    @return The amount of tokens to mint/remit to the user.
   */
  function getAmountOut(bytes16 ratio, uint112 amountIn)
    external
    pure
    returns (uint112)
  {
    require(amountIn > 0, "Invalid amount");
    if (
      ABDKMathQuad.cmp(ratio, 0) == 0 ||
      ABDKMathQuad.cmp(ratio, bytes16("0x1")) == 0
    ) {
      return amountIn;
    }
    return
      uint112(
        ABDKMathQuad.toUInt(
          ABDKMathQuad.mul(ratio, ABDKMathQuad.fromUInt(amountIn))
        )
      );
  }
}
