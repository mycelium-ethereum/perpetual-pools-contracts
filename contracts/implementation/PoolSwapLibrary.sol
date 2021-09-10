// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "abdk-libraries-solidity/ABDKMathQuad.sol";

/// @title Library for various useful (mostly) mathematical functions
library PoolSwapLibrary {
    bytes16 public constant one = 0x3fff0000000000000000000000000000;
    bytes16 public constant zero = 0x00000000000000000000000000000000;

    /* ABDKMathQuad defines this but it's private */
    bytes16 private constant NEGATIVE_ZERO = 0x80000000000000000000000000000000;
    uint256 public constant MAX_DECIMALS = 18;

    struct PriceChangeData {
        int256 oldPrice;
        int256 newPrice;
        uint256 longBalance;
        uint256 shortBalance;
        bytes16 leverageAmount;
        bytes16 fee;
    }

    /**
     * @notice Calculates the ratio between two numbers
     * @dev Rounds any overflow towards 0. If either parameter is zero, the ratio is 0
     * @param _numerator The "parts per" side of the equation. If this is zero, the ratio is zero
     * @param _denominator The "per part" side of the equation. If this is zero, the ratio is zero
     * @return the ratio, as an ABDKMathQuad number (IEEE 754 quadruple precision floating point)
     */
    function getRatio(uint256 _numerator, uint256 _denominator) public pure returns (bytes16) {
        // Catch the divide by zero error.
        if (_denominator == 0) {
            return 0;
        }
        return ABDKMathQuad.div(ABDKMathQuad.fromUInt(_numerator), ABDKMathQuad.fromUInt(_denominator));
    }

    /**
     * @notice Gets the short and long balances after the keeper rewards have been paid out
     *         Keeper rewards are paid proportionally to the short and long pool
     * @dev Assumes shortBalance + longBalance >= reward
     * @param reward Amount of keeper reward
     * @param shortBalance Short balance of the pool
     * @param longBalance Long balance of the pool
     * @return shortBalanceAfterFees Short balance of the pool after the keeper reward has been paid
     * @return longBalanceAfterFees Long balance of the pool after the keeper reward has been paid
     */
    function getBalancesAfterFees(
        uint256 reward,
        uint256 shortBalance,
        uint256 longBalance
    ) public pure returns (uint256, uint256) {
        bytes16 ratioShort = getRatio(shortBalance, shortBalance + longBalance);

        uint256 shortFees = convertDecimalToUInt(multiplyDecimalByUInt(ratioShort, reward));

        uint256 shortBalanceAfterFees = shortBalance - shortFees;
        uint256 longBalanceAfterFees = longBalance - (reward - shortFees);

        // Return shortBalance and longBalance after rewards are paid out
        return (shortBalanceAfterFees, longBalanceAfterFees);
    }

    /**
     * @notice Gets the amount of tokens a user is entitled to according to the ratio
     * @dev This is useful for getting the amount of pool tokens to mint, and the amount of quote tokens to remit when minting and burning. Can also be used to provide the user with an estimate of their commit results.
     * @param ratio The ratio to calculate. Use the getRatio function to calculate this
     * @param amountIn The amount of tokens the user is providing. This can be quote tokens or pool tokens.
     * @return The amount of tokens to mint/remit to the user.
     */
    function getAmountOut(bytes16 ratio, uint256 amountIn) public pure returns (uint256) {
        require(amountIn > 0, "Invalid amount");
        if (ABDKMathQuad.cmp(ratio, 0) == 0 || ABDKMathQuad.cmp(ratio, NEGATIVE_ZERO) == 0) {
            return amountIn;
        }
        return ABDKMathQuad.toUInt(ABDKMathQuad.mul(ratio, ABDKMathQuad.fromUInt(amountIn)));
    }

    /**
     * @notice Compares two decimal numbers
     * @param x The first number to compare
     * @param y The second number to compare
     * @return -1 if x < y, 0 if x = y, or 1 if x > y
     */
    function compareDecimals(bytes16 x, bytes16 y) public pure returns (int8) {
        return ABDKMathQuad.cmp(x, y);
    }

    /**
     * @notice Converts an integer value to a compatible decimal value
     * @param amount The amount to convert
     * @return The amount as a IEEE754 quadruple precision number
     */
    function convertUIntToDecimal(uint256 amount) external pure returns (bytes16) {
        return ABDKMathQuad.fromUInt(amount);
    }

    /**
     * @notice Converts a raw decimal value to a more readable uint256 value
     * @param ratio The value to convert
     * @return The converted value
     */
    function convertDecimalToUInt(bytes16 ratio) public pure returns (uint256) {
        return ABDKMathQuad.toUInt(ratio);
    }

    /**
     * @notice Multiplies a decimal and an unsigned integer
     * @param a The first term
     * @param b The second term
     * @return The product of a*b as a decimal
     */
    function multiplyDecimalByUInt(bytes16 a, uint256 b) public pure returns (bytes16) {
        return ABDKMathQuad.mul(a, ABDKMathQuad.fromUInt(b));
    }

    /**
     * @notice Divides two integers
     * @param a The dividend
     * @param b The divisor
     * @return The quotient
     */
    function divInt(int256 a, int256 b) public pure returns (bytes16) {
        return ABDKMathQuad.div(ABDKMathQuad.fromInt(a), ABDKMathQuad.fromInt(b));
    }

    /**
     * @notice Calculates the loss multiplier to apply to the losing pool. Includes the power leverage
     * @param ratio The ratio of new price to old price
     * @param direction The direction of the change. -1 if it's decreased, 0 if it hasn't changed, and 1 if it's increased
     * @param leverage The amount of leverage to apply
     * @return The multiplier
     */
    function getLossMultiplier(
        bytes16 ratio,
        int8 direction,
        bytes16 leverage
    ) public pure returns (bytes16) {
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
     * @notice Calculates the amount to take from the losing pool
     * @param lossMultiplier The multiplier to use
     * @param balance The balance of the losing pool
     */
    function getLossAmount(bytes16 lossMultiplier, uint256 balance) public pure returns (uint256) {
        return
            ABDKMathQuad.toUInt(
                ABDKMathQuad.mul(ABDKMathQuad.sub(one, lossMultiplier), ABDKMathQuad.fromUInt(balance))
            );
    }

    /**
     * @notice Calculates the effect of a price change. This involves calculating how many funds to transfer from the losing pool to the other.
     * @dev This function should be called by the LeveragedPool.
     * @param priceChange The struct containing necessary data to calculate price change
     */
    function calculatePriceChange(PriceChangeData memory priceChange)
        public
        pure
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 shortBalance = priceChange.shortBalance;
        uint256 longBalance = priceChange.longBalance;
        bytes16 leverageAmount = priceChange.leverageAmount;
        int256 oldPrice = priceChange.oldPrice;
        int256 newPrice = priceChange.newPrice;
        bytes16 fee = priceChange.fee;

        // Calculate fees from long and short sides
        uint256 longFeeAmount = convertDecimalToUInt(multiplyDecimalByUInt(fee, longBalance));
        uint256 shortFeeAmount = convertDecimalToUInt(multiplyDecimalByUInt(fee, shortBalance));
        uint256 totalFeeAmount = 0;

        // fee is enforced to be < 1. Therefore, shortFeeAmount < shortBalance, and longFeeAmount < longBalance
        shortBalance = shortBalance - shortFeeAmount;
        totalFeeAmount = totalFeeAmount + shortFeeAmount;
        longBalance = longBalance - longFeeAmount;
        totalFeeAmount = totalFeeAmount + longFeeAmount;

        // Use the ratio to determine if the price increased or decreased and therefore which direction
        // the funds should be transferred towards.

        bytes16 ratio = divInt(newPrice, oldPrice);
        int8 direction = compareDecimals(ratio, PoolSwapLibrary.one);
        // Take into account the leverage
        bytes16 lossMultiplier = getLossMultiplier(ratio, direction, leverageAmount);

        if (direction >= 0 && shortBalance > 0) {
            // Move funds from short to long pair
            uint256 lossAmount = getLossAmount(lossMultiplier, shortBalance);
            shortBalance = shortBalance - lossAmount;
            longBalance = longBalance + lossAmount;
        } else if (direction < 0 && longBalance > 0) {
            // Move funds from long to short pair
            uint256 lossAmount = getLossAmount(lossMultiplier, longBalance);
            shortBalance = shortBalance + lossAmount;
            longBalance = longBalance - lossAmount;
        }

        return (longBalance, shortBalance, totalFeeAmount);
    }

    /**
     * @notice Returns true if the function is being called BEFORE the frontRunningInterval starts,
     *         which is allowed for uncommitment.
     * @dev If you try to uncommit AFTER the frontRunningInterval, it should revert.
     * @param subjectTime The timestamp for which you want to calculate if it was beforeFrontRunningInterval
     * @param lastPriceTimestamp The timestamp of the last price update
     * @param updateInterval The interval between price updates
     * @param frontRunningInterval The window of time before a price udpate users can not uncommit or have their commit executed from
     */
    function isBeforeFrontRunningInterval(
        uint256 subjectTime,
        uint256 lastPriceTimestamp,
        uint256 updateInterval,
        uint256 frontRunningInterval
    ) external pure returns (bool) {
        return lastPriceTimestamp + updateInterval - frontRunningInterval > subjectTime;
    }

    /**
     * @notice Gets the number of pool tokens to be minted based on existing tokens
     * @param tokenSupply Total supply of pool tokens
     * @param amountIn Commitment amount of collateral tokens going into the pool
     * @param balance Balance of the pool (no. of underlying collateral tokens in pool)
     * @param inverseShadowbalance Balance the shadow pool at time of mint
     * @return Number of pool tokens to be minted
     */
    function getMintAmount(
        uint256 tokenSupply,
        uint256 amountIn,
        uint256 balance,
        uint256 inverseShadowbalance
    ) external pure returns (uint256) {
        return
            getAmountOut(
                // ratio = (totalSupply + inverseShadowBalance) / balance
                getRatio(tokenSupply + inverseShadowbalance, balance),
                amountIn
            );
    }

    /**
     * @notice Converts from a WAD to normal value
     * @return Converted non-WAD value
     */
    function fromWad(uint256 _wadValue, uint256 _decimals) external pure returns (uint256) {
        uint256 scaler = uint256(10**(MAX_DECIMALS - _decimals));
        return _wadValue / scaler;
    }
}
