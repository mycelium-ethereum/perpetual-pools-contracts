//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "abdk-libraries-solidity/ABDKMathQuad.sol";

/// @title Library for various useful (mostly) mathematical functions
library PoolSwapLibrary {
    /// ABDKMathQuad-formatted representation of the number one
    bytes16 public constant ONE = 0x3fff0000000000000000000000000000;

    /// Maximum number of decimal places supported by this contract
    /// (ABDKMathQuad defines this but it's private)
    uint256 public constant MAX_DECIMALS = 18;

    /// Maximum precision supportable via wad arithmetic (for this contract)
    uint256 public constant WAD_PRECISION = 10**18;

    /// Information required to update a given user's aggregated balance
    struct UpdateData {
        bytes16 longPrice;
        bytes16 shortPrice;
        bytes16 mintingFeeRate;
        uint256 currentUpdateIntervalId;
        uint256 updateIntervalId;
        uint256 longMintSettlement;
        uint256 longBurnPoolTokens;
        uint256 shortMintSettlement;
        uint256 shortBurnPoolTokens;
        uint256 longBurnShortMintPoolTokens;
        uint256 shortBurnLongMintPoolTokens;
        bytes16 burnFee;
    }

    /// Information about the result of calculating a user's updated aggregate balance
    struct UpdateResult {
        uint256 _newLongTokens; // Quantity of long pool tokens post-application
        uint256 _newShortTokens; // Quantity of short pool tokens post-application
        uint256 _longSettlementFee; // The fee taken from ShortBurnLongMint commits
        uint256 _shortSettlementFee; // The fee taken from ShortBurnLongMint commits
        uint256 _newSettlementTokens; // Quantity of settlement tokens post
    }

    /// Information required to perform a price change (of the underlying asset)
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
     * @notice Multiplies two numbers
     * @param x The number to be multiplied by `y`
     * @param y The number to be multiplied by `x`
     */
    function multiplyBytes(bytes16 x, bytes16 y) external pure returns (bytes16) {
        return ABDKMathQuad.mul(x, y);
    }

    /**
     * @notice Performs a subtraction on two bytes16 numbers
     * @param x The number to be subtracted by `y`
     * @param y The number to subtract from `x`
     */
    function subtractBytes(bytes16 x, bytes16 y) external pure returns (bytes16) {
        return ABDKMathQuad.sub(x, y);
    }

    /**
     * @notice Performs an addition on two bytes16 numbers
     * @param x The number to be added with `y`
     * @param y The number to be added with `x`
     */
    function addBytes(bytes16 x, bytes16 y) external pure returns (bytes16) {
        return ABDKMathQuad.add(x, y);
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
    ) external pure returns (uint256, uint256) {
        bytes16 ratioShort = getRatio(shortBalance, shortBalance + longBalance);

        uint256 shortFees = convertDecimalToUInt(multiplyDecimalByUInt(ratioShort, reward));

        uint256 shortBalanceAfterFees = shortBalance - shortFees;
        uint256 longBalanceAfterFees = longBalance - (reward - shortFees);

        // Return shortBalance and longBalance after rewards are paid out
        return (shortBalanceAfterFees, longBalanceAfterFees);
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
     * @notice Divides two unsigned integers
     * @param a The dividend
     * @param b The divisor
     * @return The quotient
     */
    function divUInt(uint256 a, uint256 b) private pure returns (bytes16) {
        return ABDKMathQuad.div(ABDKMathQuad.fromUInt(a), ABDKMathQuad.fromUInt(b));
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
     * @notice Multiply an integer by a fraction
     * @notice number * numerator / denominator
     * @param number The number with which the fraction calculated from `numerator` and `denominator` will be multiplied
     * @param numerator The numerator of the fraction being multipled with `number`
     * @param denominator The denominator of the fraction being multipled with `number`
     * @return The result of multiplying number with numerator/denominator, as an integer
     */
    function mulFraction(
        uint256 number,
        uint256 numerator,
        uint256 denominator
    ) public pure returns (uint256) {
        if (denominator == 0) {
            return 0;
        }
        bytes16 multiplyResult = ABDKMathQuad.mul(ABDKMathQuad.fromUInt(number), ABDKMathQuad.fromUInt(numerator));
        bytes16 result = ABDKMathQuad.div(multiplyResult, ABDKMathQuad.fromUInt(denominator));
        return convertDecimalToUInt(result);
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
                ABDKMathQuad.mul(leverage, ABDKMathQuad.log_2(direction < 0 ? ratio : ABDKMathQuad.div(ONE, ratio)))
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
                ABDKMathQuad.mul(ABDKMathQuad.sub(ONE, lossMultiplier), ABDKMathQuad.fromUInt(balance))
            );
    }

    /**
     * @notice Calculates the effect of a price change. This involves calculating how many funds to transfer from the losing pool to the other.
     * @dev This function should be called by the LeveragedPool
     * @dev The value transfer is calculated using a sigmoid function
     * @dev The sigmoid function used is defined as follows:
     *          when newPrice >= oldPrice
     *              losing_pool_multiplier = 2 / (1 + e^(-2 * L * (1 - (newPrice / oldPrice)))) - 1
     *          when newPrice < oldPrice
     *              losing_pool_multiplier = 2 / (1 + e^(-2 * L * (1 - (oldPrice / newPrice)))) - 1
     *          where
     *              e = euler's number
     *              L = leverage
     *              newPrice = the new oracle price
     *              oldPrice = the previous oracle price
     * @param longBalance Settlement token balance on the long side of the pool before the price change
     * @param shortBalance Settlement token balance on the short side of the pool before the price change
     * @param leverageAmount The leverage of the pool
     * @param oldPrice The previous price
     * @param newPrice The new price
     * @param fee The pool's annualised protocol fee
     * @return Resulting long balance
     * @return Resulting short balance
     * @return Resulting fees taken from long balance
     * @return Resulting fees taken from short balance
     */
    function calculateValueTransfer(
        uint256 longBalance,
        uint256 shortBalance,
        bytes16 leverageAmount,
        int256 oldPrice,
        int256 newPrice,
        bytes16 fee
    )
        external
        pure
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        // Copy into a struct (otherwise stack gets too deep)
        PriceChangeData memory priceChangeData = PoolSwapLibrary.PriceChangeData(
            oldPrice,
            newPrice,
            longBalance,
            shortBalance,
            leverageAmount,
            fee
        );
        // Calculate fees from long and short sides
        uint256 longFeeAmount = convertDecimalToUInt(
            multiplyDecimalByUInt(priceChangeData.fee, priceChangeData.longBalance)
        ) / PoolSwapLibrary.WAD_PRECISION;
        uint256 shortFeeAmount = convertDecimalToUInt(
            multiplyDecimalByUInt(priceChangeData.fee, priceChangeData.shortBalance)
        ) / PoolSwapLibrary.WAD_PRECISION;

        priceChangeData.shortBalance -= shortFeeAmount;
        priceChangeData.longBalance -= longFeeAmount;

        uint256 sumBeforePriceChange = priceChangeData.shortBalance + priceChangeData.longBalance;

        if (newPrice >= oldPrice && priceChangeData.shortBalance > 0) {
            // Price increased
            // Using the sigmoid function defined in the function's natspec, move funds from short side to long side
            bytes16 ratio = divInt(priceChangeData.oldPrice, priceChangeData.newPrice);
            bytes16 poolMultiplier = sigmoid(leverageAmount, ratio);

            priceChangeData.longBalance += ABDKMathQuad.toUInt(
                ABDKMathQuad.mul(ABDKMathQuad.fromUInt(priceChangeData.shortBalance), poolMultiplier)
            );
            priceChangeData.shortBalance = ABDKMathQuad.toUInt(
                ABDKMathQuad.mul(
                    ABDKMathQuad.fromUInt(priceChangeData.shortBalance),
                    ABDKMathQuad.sub(ONE, poolMultiplier)
                )
            );
        } else if (newPrice < oldPrice && priceChangeData.longBalance > 0) {
            // Price decreased
            // Using the sigmoid function defined in the function's natspec, move funds from long side to short side
            bytes16 ratio = divInt(priceChangeData.newPrice, priceChangeData.oldPrice);
            bytes16 poolMultiplier = sigmoid(leverageAmount, ratio);

            priceChangeData.shortBalance += ABDKMathQuad.toUInt(
                ABDKMathQuad.mul(ABDKMathQuad.fromUInt(priceChangeData.longBalance), poolMultiplier)
            );
            priceChangeData.longBalance = ABDKMathQuad.toUInt(
                ABDKMathQuad.mul(
                    ABDKMathQuad.fromUInt(priceChangeData.longBalance),
                    ABDKMathQuad.sub(ONE, poolMultiplier)
                )
            );
        }

        if (sumBeforePriceChange > priceChangeData.longBalance + priceChangeData.shortBalance) {
            // Move dust into winning side
            // This is only ever 1 wei (negligible)
            if (newPrice > oldPrice) {
                priceChangeData.longBalance +=
                    sumBeforePriceChange -
                    (priceChangeData.longBalance + priceChangeData.shortBalance);
            } else {
                priceChangeData.shortBalance +=
                    sumBeforePriceChange -
                    (priceChangeData.longBalance + priceChangeData.shortBalance);
            }
        }

        return (priceChangeData.longBalance, priceChangeData.shortBalance, longFeeAmount, shortFeeAmount);
    }

    /**
     * @notice Use a sigmoid function to determine the losing pool multiplier.
     * @return The losing pool multiplier, represented as an ABDKMathQuad IEEE754 quadruple-precision binary floating-point numbers
     * @dev The returned value is used in `calculateValueTransfer` as the portion to move from the losing side into the winning side
     */
    function sigmoid(bytes16 leverage, bytes16 ratio) private pure returns (bytes16) {
        /**
         * denominator = 1 + e ^ (-2 * leverage * (1 - ratio))
         */
        bytes16 denominator = ABDKMathQuad.mul(ABDKMathQuad.fromInt(-2), leverage);
        denominator = ABDKMathQuad.mul(denominator, ABDKMathQuad.sub(ONE, ratio));
        denominator = ABDKMathQuad.add(ONE, ABDKMathQuad.exp(denominator));
        bytes16 numerator = ABDKMathQuad.add(ONE, ONE); // 2
        return ABDKMathQuad.sub((ABDKMathQuad.div(numerator, denominator)), ONE);
    }

    /**
     * @notice Returns true if the given timestamp is BEFORE the frontRunningInterval starts
     * @param subjectTime The timestamp for which you want to calculate if it was beforeFrontRunningInterval
     * @param lastPriceTimestamp The timestamp of the last price update
     * @param updateInterval The interval between price updates
     * @param frontRunningInterval The window of time before a price update in which users can have their commit executed from
     */
    function isBeforeFrontRunningInterval(
        uint256 subjectTime,
        uint256 lastPriceTimestamp,
        uint256 updateInterval,
        uint256 frontRunningInterval
    ) public pure returns (bool) {
        return lastPriceTimestamp + updateInterval - frontRunningInterval > subjectTime;
    }

    /**
     * @notice Calculates the update interval ID that a commitment should be placed in.
     * @param timestamp Current block.timestamp
     * @param lastPriceTimestamp The timestamp of the last price update
     * @param frontRunningInterval The frontrunning interval of a pool - The amount of time before an update interval that you must commit to get included in that update
     * @param updateInterval The frequency of a pool's updates
     * @param currentUpdateIntervalId The current update interval's ID
     * @dev Note that the timestamp parameter is required to be >= lastPriceTimestamp
     * @return The update interval ID in which a commit being made at time timestamp should be included
     */
    function appropriateUpdateIntervalId(
        uint256 timestamp,
        uint256 lastPriceTimestamp,
        uint256 frontRunningInterval,
        uint256 updateInterval,
        uint256 currentUpdateIntervalId
    ) external pure returns (uint256) {
        require(lastPriceTimestamp <= timestamp, "timestamp in the past");
        if (frontRunningInterval <= updateInterval) {
            // This is the "simple" case where we either want the current update interval or the next one
            if (isBeforeFrontRunningInterval(timestamp, lastPriceTimestamp, updateInterval, frontRunningInterval)) {
                // We are before the frontRunning interval
                return currentUpdateIntervalId;
            } else {
                // Floor of `timePassed / updateInterval` to get the number of intervals passed
                uint256 updateIntervalsPassed = (timestamp - lastPriceTimestamp) / updateInterval;
                // If 1 update interval has passed, we want to check if we are within the frontrunning interval of currentUpdateIntervalId + 1
                uint256 frontRunningIntervalStart = lastPriceTimestamp +
                    ((updateIntervalsPassed + 1) * updateInterval) -
                    frontRunningInterval;
                if (timestamp >= frontRunningIntervalStart) {
                    // add an extra update interval because the frontrunning interval has passed
                    return currentUpdateIntervalId + updateIntervalsPassed + 1;
                } else {
                    return currentUpdateIntervalId + updateIntervalsPassed;
                }
            }
        } else {
            // frontRunningInterval > updateInterval
            // This is the generalised case, where it could be any number of update intervals in the future
            // Minimum time is the earliest we could possible execute this commitment (i.e. the current time plus frontrunning interval)
            uint256 minimumTime = timestamp + frontRunningInterval;
            // Number of update intervals that would have had to have passed.
            uint256 updateIntervals = (minimumTime - lastPriceTimestamp) / updateInterval;

            return currentUpdateIntervalId + updateIntervals;
        }
    }

    /**
     * @notice Gets the number of settlement tokens to be withdrawn based on a pool token burn amount
     * @dev Calculates as `balance * amountIn / (tokenSupply + shadowBalance)
     * @param tokenSupply Total supply of pool tokens
     * @param amountIn Commitment amount of pool tokens going into the pool
     * @param balance Balance of the pool (no. of underlying settlement tokens in pool)
     * @param pendingBurnPoolTokens Amount of pool tokens being burnt during this update interval
     * @return Number of settlement tokens to be withdrawn on a burn
     */
    function getWithdrawAmountOnBurn(
        uint256 tokenSupply,
        uint256 amountIn,
        uint256 balance,
        uint256 pendingBurnPoolTokens
    ) external pure returns (uint256) {
        // Catch the divide by zero error, or return 0 if amountIn is 0
        if ((balance == 0) || (tokenSupply + pendingBurnPoolTokens == 0) || (amountIn == 0)) {
            return amountIn;
        }
        return (balance * amountIn) / (tokenSupply + pendingBurnPoolTokens);
    }

    /**
     * @notice Gets the number of pool tokens to be minted based on existing tokens
     * @dev Calculated as (tokenSupply + shadowBalance) * amountIn / balance
     * @param tokenSupply Total supply of pool tokens
     * @param amountIn Commitment amount of settlement tokens going into the pool
     * @param balance Balance of the pool (no. of underlying settlement tokens in pool)
     * @param pendingBurnPoolTokens Amount of pool tokens being burnt during this update interval
     * @return Number of pool tokens to be minted
     */
    function getMintAmount(
        uint256 tokenSupply,
        uint256 amountIn,
        uint256 balance,
        uint256 pendingBurnPoolTokens
    ) external pure returns (uint256) {
        // Catch the divide by zero error, or return 0 if amountIn is 0
        if (balance == 0 || tokenSupply + pendingBurnPoolTokens == 0 || amountIn == 0) {
            return amountIn;
        }

        return ((tokenSupply + pendingBurnPoolTokens) * amountIn) / balance;
    }

    /**
     * @notice Get the Settlement/PoolToken price, in ABDK IEE754 precision
     * @dev Divide the side balance by the pool token's total supply
     * @param sideBalance no. of underlying settlement tokens on that side of the pool
     * @param tokenSupply Total supply of pool tokens
     */
    function getPrice(uint256 sideBalance, uint256 tokenSupply) external pure returns (bytes16) {
        if (tokenSupply == 0) {
            return ONE;
        }
        return ABDKMathQuad.div(ABDKMathQuad.fromUInt(sideBalance), ABDKMathQuad.fromUInt(tokenSupply));
    }

    /**
     * @notice Calculates the number of pool tokens to mint, given some settlement token amount and a price
     * @param price Price of a pool token
     * @param amount Amount of settlement tokens being used to mint
     * @return Quantity of pool tokens to mint
     * @dev Throws if price is zero
     * @dev `getMint()`
     */
    function getMint(bytes16 price, uint256 amount) public pure returns (uint256) {
        require(price != 0, "price == 0");
        return ABDKMathQuad.toUInt(ABDKMathQuad.div(ABDKMathQuad.fromUInt(amount), price));
    }

    /**
     * @notice Calculate the number of settlement tokens to burn, based on a price and an amount of pool tokens
     * @param price Price of a pool token
     * @param amount Amount of pool tokens being used to burn
     * @return Quantity of settlement tokens to return to the user after `amount` pool tokens are burnt.
     * @dev amount * price, where amount is in PoolToken and price is in USD/PoolToken
     * @dev Throws if price is zero
     * @dev `getBurn()`
     */
    function getBurn(bytes16 price, uint256 amount) public pure returns (uint256) {
        require(price != 0, "price == 0");
        return ABDKMathQuad.toUInt(ABDKMathQuad.mul(ABDKMathQuad.fromUInt(amount), price));
    }

    /**
     * @notice Calculate the amount of settlement tokens to take as the minting fee
     * @param feeRate PoolCommitter's mintingFee or burningFee - The amount that is extracted from each mint or burn. Given as the decimal * 10 ^ 18. For example, 60% fee is 0.6 * 10 ^ 18 Fees can be 0.
     * @param amount The amount of settlement tokens being committed to mint
     */
    function mintingOrBurningFee(bytes16 feeRate, uint256 amount) public pure returns (uint256) {
        return ABDKMathQuad.toUInt(multiplyDecimalByUInt(feeRate, amount)) / WAD_PRECISION;
    }

    /**
     * @notice Converts from a WAD to normal value
     * @param _wadValue wad number
     * @param _decimals Quantity of decimal places to support
     * @return Converted (non-WAD) value
     */
    function fromWad(uint256 _wadValue, uint256 _decimals) external pure returns (uint256) {
        uint256 scaler = 10**(MAX_DECIMALS - _decimals);
        return _wadValue / scaler;
    }

    /**
     * @notice Given an amount of pool tokens to flip to the other side of the pool, calculate the amount of settlement tokens generated from the burn, burn fee, and subsequent minting fee
     * @dev Takes out the burn fee before taking out the mint fee.
     * @param amount The amount of pool tokens being flipped
     * @param burnPrice The price of the pool token being burnt
     * @param burningFee Fee rate for pool token burns
     * @param mintingFee Fee rate for mints
     * @return Amount of settlement tokens used to mint.
     * @return The burn fee. This should be given to the side of the pool of the burnt tokens.
     * @return The mint fee. This should be given to the side of the pool that is being minted into.
     */
    function processBurnInstantMintCommit(
        uint256 amount,
        bytes16 burnPrice,
        bytes16 burningFee,
        bytes16 mintingFee
    )
        public
        pure
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        // Settlement tokens earned from burning pool tokens (for instant mint)
        uint256 mintSettlement = getBurn(burnPrice, amount);
        // The burn fee. This should be given to the side of the pool of the burnt tokens.
        uint256 burnFee = mintingOrBurningFee(burningFee, mintSettlement);
        mintSettlement -= burnFee;

        // The mint fee. This should be given to the side of the pool that is being minted into.
        uint256 mintFee = mintingOrBurningFee(mintingFee, mintSettlement);
        mintSettlement -= mintFee;
        return (mintSettlement, burnFee, mintFee);
    }

    /**
     * @notice Calculate the change in a user's balance based on recent commit(s)
     * @param data Information needed for updating the balance including prices and recent commit amounts
     * @return The UpdateResult struct with the data pertaining to the update of user's aggregate balance
     */
    function getUpdatedAggregateBalance(UpdateData calldata data) external view returns (UpdateResult memory) {
        UpdateResult memory result = UpdateResult(0, 0, 0, 0, 0);
        if (data.updateIntervalId >= data.currentUpdateIntervalId) {
            // Update interval has not passed: No change
            return result;
        }

        /**
         * Start by looking at the "flip" commitments (either LongBurnShortMint, or ShortBurnLongMint), and determine the amount of settlement tokens were generated from them.
         * Then, take the burning fee off them and add that to the relevant side's fee amount. e.g. a ShortBurnLongMint will generate burn fees for the short side.
         * Now, we can calculate how much minting fee should be paid by the user. This should then be added to the side which they are minting on.
         */
        uint256 shortBurnLongMintResult; // Settlement to be included in the long mint
        uint256 longBurnShortMintResult; // Settlement to be included in the short mint
        if (data.shortBurnLongMintPoolTokens > 0) {
            uint256 burnFeeSettlement;
            uint256 mintFeeSettlement;
            (shortBurnLongMintResult, burnFeeSettlement, mintFeeSettlement) = processBurnInstantMintCommit(
                data.shortBurnLongMintPoolTokens,
                data.shortPrice,
                data.burnFee,
                data.mintingFeeRate
            );
            result._shortSettlementFee += burnFeeSettlement;
            result._longSettlementFee += mintFeeSettlement;
        }
        if (data.longBurnShortMintPoolTokens > 0) {
            // Settlement tokens earned from burning long tokens (for instant mint)
            longBurnShortMintResult = getBurn(data.longPrice, data.longBurnShortMintPoolTokens);
            // The burn fee taken from this burn. This should be given to the long side.
            uint256 burnFeeSettlement = mintingOrBurningFee(data.burnFee, longBurnShortMintResult);
            longBurnShortMintResult -= burnFeeSettlement;

            // The mint fee taken from the subsequent mint
            uint256 mintFeeSettlement = mintingOrBurningFee(data.mintingFeeRate, longBurnShortMintResult);
            longBurnShortMintResult -= mintFeeSettlement;

            result._longSettlementFee += burnFeeSettlement;
            result._shortSettlementFee += mintFeeSettlement;
        }

        /**
         * Calculate the new long tokens minted.
         * Use amount committed LongMint/ShortMint, as well as settlement tokens generated from ShortBurnLongMint/LongBurnShortMint commits.
         */
        if (data.longMintSettlement > 0 || shortBurnLongMintResult > 0) {
            result._newLongTokens += getMint(data.longPrice, data.longMintSettlement + shortBurnLongMintResult);
        }
        if (data.shortMintSettlement > 0 || longBurnShortMintResult > 0) {
            result._newShortTokens += getMint(data.shortPrice, data.shortMintSettlement + longBurnShortMintResult);
        }

        /**
         * Calculate the settlement tokens earned through LongBurn/ShortBurn commits.
         * Once this is calculated, take off the burn fee, and add to the respective side's fee amount.
         */
        if (data.longBurnPoolTokens > 0) {
            // Calculate the amount of settlement tokens earned from burning long tokens
            uint256 longBurnResult = getBurn(data.longPrice, data.longBurnPoolTokens);
            // Calculate the fee
            uint256 longBurnFee = mintingOrBurningFee(data.burnFee, longBurnResult);
            result._longSettlementFee += longBurnFee;
            // Subtract the fee from settlement token amount
            longBurnResult -= longBurnFee;
            result._newSettlementTokens += longBurnResult;
        }
        if (data.shortBurnPoolTokens > 0) {
            // Calculate the amount of settlement tokens earned from burning short tokens
            uint256 shortBurnResult = getBurn(data.shortPrice, data.shortBurnPoolTokens);
            // Calculate the fee
            uint256 shortBurnFee = mintingOrBurningFee(data.burnFee, shortBurnResult);
            result._shortSettlementFee += shortBurnFee;
            // Subtract the fee from settlement token amount
            shortBurnResult -= shortBurnFee;
            result._newSettlementTokens += shortBurnResult;
        }

        return result;
    }
}
