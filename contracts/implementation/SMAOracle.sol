// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;
import "../interfaces/IOracleWrapper.sol";
import "../interfaces/IPriceObserver.sol";
import "../implementation/PriceObserver.sol";

contract SMAOracle is IOracleWrapper {
    /// Price oracle supplying the spot price of the quote asset
    address public override oracle;

    // Deployer of the oracle
    address public immutable override deployer;

    /// Price observer providing the SMA oracle with historical pricing data
    address public observer;

    /// Number of periods to use in calculating the SMA (`k` in the SMA equation)
    uint256 public periods;

    /// Time of last successful price update
    uint256 public lastUpdate;

    /// Duration between price updates
    uint256 public updateInterval;

    int256 public scaler;
    uint256 public constant MAX_DECIMALS = 18;
    /// Maximum number of elements storable by the backing array
    uint256 public constant MAX_NUM_ELEMS = 24;

    constructor(
        address _spotOracle,
        uint256 _spotDecimals,
        address _observer,
        uint256 _periods,
        uint256 _updateInterval,
        address _deployer
    ) {
        require(
            _spotOracle != address(0) && _observer != address(0) && _deployer != address(0),
            "SMA: Null address forbidden"
        );
        require(_periods > 0 && _periods <= IPriceObserver(_observer).capacity(), "SMA: Out of bounds");
        require(_spotDecimals <= MAX_DECIMALS, "SMA: Decimal precision too high");
        periods = _periods;
        oracle = _spotOracle;
        observer = _observer;
        deployer = _deployer;

        /* `scaler` is always <= 10^18 and >= 1 so this cast is safe */
        scaler = int256(10**(MAX_DECIMALS - _spotDecimals));
        updateInterval = _updateInterval;
    }

    /**
     * @notice Converts `wad` to a raw integer
     * @param wad wad maths value
     * @return Raw (signed) integer
     */
    function fromWad(int256 wad) external view override returns (int256) {
        return wad / scaler;
    }

    /**
     * @notice Retrieves the current SMA price
     * @dev Recomputes SMA across sample size (`periods`)
     */
    function getPrice() external view override returns (int256) {
        /* update current reported SMA price */
        return SMA(IPriceObserver(observer).getAll(), periods);
    }

    /**
     * @notice Add a new spot price observation to the SMA oracle
     * @dev O(n) complexity (with n being `capacity`) due to rotation of
     *      underlying observations array and subsequent recalculation of SMA
     *      price
     */
    function update() internal returns (int256) {
        /* query the underlying spot price oracle */
        IOracleWrapper spotOracle = IOracleWrapper(oracle);
        int256 latestPrice = spotOracle.getPrice();

        /* expire the oldest observation and load the fresh one in */
        IPriceObserver priceObserver = IPriceObserver(observer);
        priceObserver.add(latestPrice);

        /* update time of last price update */
        lastUpdate = block.timestamp;

        /* update current reported SMA price */
        return SMA(priceObserver.getAll(), periods);
    }

    /**
     * @notice Updates the SMA oracle by retrieving a new price from the
     *          associated price observer contract (provided it's not too early)
     * @return Latest SMA price
     * @dev Throws if called within an update interval since last being called
     * @dev Essentially wraps `update()`
     */
    function poll() external override returns (int256) {
        require(block.timestamp >= lastUpdate + updateInterval, "SMA: Too early to update");
        return update();
    }

    /**
     * @notice Calculates the simple moving average of the provided dataset for the specified number of periods
     * @param xs Dataset
     * @param k Number of periods to use for calculation of the SMA
     * @return Simple moving average for `k` periods
     * @dev Throws if `k` is zero (due to necessary division)
     * @dev Throws if `k` is greater than or equal to the length of `xs` (due to buffer overrun potential)
     * @dev Throws if `k` is the maximum *signed* 256-bit integer (due to necessary division)
     * @dev O(k) complexity due to linear traversal of the final `k` elements of `xs`
     * @dev Note that the signedness of the return type is due to the signedness of the elements of `xs`
     * @dev It's a true tragedy that we have to stipulate a fixed-length array for `xs`, but alas, Solidity's type system cannot
     *          reason about this at all due to the value's runtime requirement
     */
    function SMA(int256[MAX_NUM_ELEMS] memory xs, uint256 k) public pure returns (int256) {
        uint256 n = xs.length;

        /* bounds check */
        require(k > 0 && k <= n && k <= uint256(type(int256).max), "SMA: Out of bounds");

        /* running total */
        int256 S;

        /* linear scan over the [n - k, n] subsequence */
        for (uint256 i = n - k; i < n; i++) {
            S += xs[i];
        }

        /* cast is safe due to above bounds check */
        return S / int256(k);
    }

    /**
     * @notice Returns the current SMA price and an empty bytes array
     * @dev Required by the `IOracleWrapper` interface. The interface leaves
     *          the metadata as implementation-defined. For the SMA oracle, there
     *          is no clear use case for additional data, so it's left blank
     */
    function getPriceAndMetadata() external view override returns (int256, bytes memory) {
        int256 _price = SMA(IPriceObserver(observer).getAll(), periods);
        bytes memory _data;
        return (_price, _data);
    }
}
