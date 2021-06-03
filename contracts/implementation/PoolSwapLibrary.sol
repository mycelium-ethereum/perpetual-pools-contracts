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
    @notice Gets the amount of tokens a user is entitled to according to the ratio
    @dev This is useful for getting the amount of pool tokens to mint, and the amount of quote tokens to remit when minting and burning. Can also be used to provide the user with an estimate of their commit results.
    @param ratio The ratio to calculate. Use the getRatio function to calculate this
    @param amountIn The amount of tokens the user is providing. This can be quote tokens or pool tokens.
    @return The amount of tokens to mint/remit to the user.
   */
  function getAmountOut(bytes16 ratio, uint112 amountIn)
    external
    pure
    returns (uint256)
  {
    require(amountIn > 0, "Invalid amount");
    if (
      ABDKMathQuad.cmp(ratio, 0) == 0 ||
      ABDKMathQuad.cmp(ratio, bytes16("0x1")) == 0
    ) {
      return amountIn;
    }
    return
      ABDKMathQuad.toUInt(
        ABDKMathQuad.mul(ratio, ABDKMathQuad.fromUInt(amountIn))
      );
  }

  // 128 bit safe math
}
