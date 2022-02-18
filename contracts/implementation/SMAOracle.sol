pragma solidity 0.8.7;

import "prb-math/contracts/PRBMathSD59x18.sol";

import "../interfaces/IOracleWrapper.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV2V3Interface.sol";

/**
 * @notice Applies a simple moving average (SMA) smoothing function to the spot
 *          price of an underlying oracle.
 */
contract SMAOracle is IOracleWrapper {
    using PRBMathSD59x18 for int256;
    /*
     * A note on "ramping up":
     *
     * `SMAOracle` works by storing spot prices and calculating the average of
     * the most recent k prices. Obviously, we need to handle the case of insufficient
     * data: specifically, the case where the number of actual stored observations, n,
     * is strictly less than the number of sampling periods to use for averaging, k.
     *
     * To achieve this, `SMAOracle` needs to "ramp up". This means that the
     * number of sampling periods *actually used*, K, looks like this (w.r.t.
     * time, t):
     *
     *     K ^
     *       |
     *       |
     *       |
     *       |
     *       |
     * k --> |+++++++++++++++++++++++++++++++++-----------------------------
     *       |                                |
     *       |                                |
     *       |                     +----------+
     *       |                     |
     *       |                     |
     *       |          +----------+
     *       |          |
     *       |          |
     *       |----------+
     *       |
     *       |
     *       +---------------------------------------------------------------> t
     *
     *
     * Here, K is the `periods` instance variable and time, t, is an integer
     * representing successive calls to `SMAOracle::poll`.
     *
     */

    /**
     * @notice the stored spot prices by their period number
     * @dev Only the most recent `numPeriods` prices are stored. The rest are deleted,
     * which will result in a zero value for prices with index less than `periodCount - numPrices`.
     */
    mapping(uint256 => int256) public prices;
    /// @notice the total number of periods that have occurred
    uint256 public periodCount;

    /// Price feed to use for SMA
    address public immutable oracleAddress;

    // Deployer of the contract
    address public immutable override deployer;

    /// Number of desired sampling periods to use -- this will differ from
    /// the actual number of periods used until the SMAOracle ramps up.
    uint256 public immutable numPeriods;

    /// Duration between price updates
    uint256 public immutable updateInterval;

    /// Time of last successful price update
    uint256 public lastUpdate;

    uint8 public constant MAX_PERIODS = 24;

    int256 public immutable scaler;
    uint256 public constant MAX_DECIMALS = 18;

    constructor(
        address _oracleAddress,
        uint256 _inputFeedDecimals,
        uint256 _numPeriods,
        uint256 _updateInterval,
        address _deployer
    ) {
        require(_oracleAddress != address(0), "SMA: Null address forbidden");
        require(_numPeriods > 0 && _numPeriods <= MAX_PERIODS, "SMA: Out of bounds");
        require(_inputFeedDecimals <= MAX_DECIMALS, "SMA: Decimal precision too high");
        numPeriods = _numPeriods;
        updateInterval = _updateInterval;
        oracleAddress = _oracleAddress;
        deployer = _deployer;

        /* `scaler` is always <= 10^18 and >= 1 so this cast is safe */
        scaler = int256(10**(MAX_DECIMALS - _inputFeedDecimals));
    }

    function oracle() external view override returns (address) {
        return oracleAddress;
    }

    /**
     * @notice Retrieves the current SMA price
     * @dev Recomputes SMA across sample size
     */
    function getPrice() external view override returns (int256) {
        return _calculateSMA();
    }

    /**
     * @notice Returns the current SMA price and an empty bytes array
     * @dev Required by the `IOracleWrapper` interface. The interface leaves
     *          the metadata as implementation-defined. For the SMA wrapper, there
     *          is no clear use case for additional data, so it's left blank
     */
    function getPriceAndMetadata() external view override returns (int256 _price, bytes memory _data) {
        _price = _calculateSMA();
        _data = "";
    }

    /**
     * @notice Updates the SMA wrapper by retrieving a new price from the
     *          associated price observer contract (provided it's not too early)
     * @return Latest SMA price
     * @dev Throws if called within an update interval since last being called
     * @dev Essentially wraps `update()`
     */
    function poll() external override returns (int256) {
        if (block.timestamp >= lastUpdate + updateInterval) {
            _update();
        }
        return _calculateSMA();
    }

    /**
     * @notice Converts `wad` to a raw integer
     * @dev This is a no-op for `SMAOracle`
     * @param wad wad maths value
     * @return Raw (signed) integer
     */
    function fromWad(int256 wad) external view override returns (int256) {
        return wad / scaler;
    }

    /**
     * @notice Add a new spot price observation to the SMA Oracle
     * @dev O(n) complexity (with n being `capacity`) due to rotation of
     *      underlying observations array and subsequent recalculation of SMA
     *      price
     */
    function _update() internal {
        /* query the underlying price feed */
        (int256 latestPrice, ) = _latestRoundData();

        /* store the latest price */
        prices[periodCount] = latestPrice;

        /* if we've filled the numPeriods amount, delete the oldest price */
        if (periodCount >= numPeriods) {
            delete prices[periodCount - numPeriods];
        }

        periodCount++;
        lastUpdate = block.timestamp;
    }

    function _latestRoundData() internal view returns (int256 _price, uint80 _roundID) {
        (uint80 roundID, int256 price, , uint256 timeStamp, uint80 answeredInRound) = AggregatorV2V3Interface(
            oracleAddress
        ).latestRoundData();
        require(answeredInRound >= roundID, "COA: Stale answer");
        require(timeStamp != 0, "COA: Round incomplete");
        return (toWad(price), roundID);
    }

    /**
     * @notice Calculates the simple moving average of the provided dataset for the specified number of periods
     * @return Simple moving average based on the last `k` prices
     * @dev `k` is the lower value of `numPeriods` and `periodCount`
     * @dev O(k) complexity due to linear traversal of the final `k` elements of `prices`
     * @dev Note that the signedness of the return type is due to the signedness of the elements of `prices`
     */
    function _calculateSMA() internal view returns (int256) {
        uint256 k = periodCount;

        if (k == 0) {
            return 0;
        }

        if (k > numPeriods) {
            k = numPeriods;
        }

        int256 sum;
        for (uint256 i = periodCount - k; i < periodCount; i++) {
            sum += prices[i];
        }

        /// This is safe because we know that `k` will be between 1 and MAX_PERIODS
        return sum / int256(k);
    }

    /**
     * @notice Converts `x` to a wad value
     * @param x Number to convert to wad value
     * @return `x` but wad
     */
    function toWad(int256 x) private view returns (int256) {
        return x * scaler;
    }
}
