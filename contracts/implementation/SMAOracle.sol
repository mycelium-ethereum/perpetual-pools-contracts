// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "../interfaces/IOracleWrapper.sol";
import "../interfaces/IPriceObserver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SMAOracle is Ownable, IOracleWrapper {
    /// Price oracle supplying the spot price of the quote asset
    address public override oracle;

    /// Price observer providing the SMA oracle with historical pricing data
    address public observer;

    /// Current SMA price
    int256 public price;

    /// Number of periods to use in calculating the SMA (`k` in the SMA equation)
    uint256 public periods;

    int256 public scaler;
    uint256 public constant MAX_DECIMALS = 18;

    constructor(
        address _spotOracle,
        uint256 _spotDecimals,
        address _observer,
        uint256 _periods
    ) {
        require(_spotOracle != address(0) && _observer != address(0), "SMA: Null address forbidden");
        require(_periods > 0 && _periods <= IPriceObserver(_observer).capacity(), "SMA: Out of bounds");
        require(_spotDecimals <= MAX_DECIMALS, "SMA: Decimal precision too high");
        periods = _periods;
        setOracle(_spotOracle);
        setObserver(_observer);

        /* `scaler` is always <= 10^18 and >= 1 so this cast is safe */
        scaler = int256(10**(MAX_DECIMALS - _spotDecimals));

        price = SMA(IPriceObserver(_observer).getAll(), _periods);
    }

    function setOracle(address _spotOracle) public override onlyOwner {
        oracle = _spotOracle;
    }

    function setObserver(address _observer) public onlyOwner {
        observer = _observer;
    }

    function getPrice() external view override returns (int256) {
        return price;
    }

    /**
     * @notice Add a new spot price observation to the SMA oracle
     * @dev O(n) complexity (with n being `capacity`) due to rotation of
     *      underlying observations array and subsequent recalculation of SMA
     *      price
     *
     */
    function update() public returns (int256) {
        /* query the underlying spot price oracle */
        IOracleWrapper spotOracle = IOracleWrapper(oracle);
        int256 latestPrice = spotOracle.getPrice();

        /* expire the oldest observation and load the fresh one in */
        IPriceObserver priceObserver = IPriceObserver(observer);
        priceObserver.add(latestPrice);

        /* update current reported SMA price */
        price = SMA(priceObserver.getAll(), periods);

        return price;
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
     *
     */
    function SMA(int256[24] memory xs, uint256 k) public pure returns (int256) {
        uint256 n = xs.length;

        /* bounds check */
        require(k > 0 && k <= n && k <= uint256(type(int256).max), "SMA: Out of bounds");

        /* running total */
        int256 S = 0;

        /* linear scan over the [n - k, n] subsequence */
        for (uint256 i = n - k; i < n; i++) {
            S += xs[i];
        }

        /* cast is safe due to above bounds check */
        return S / int256(k);
    }

    function toWad(int256 x) private view returns (int256) {
        return x * scaler;
    }

    function fromWad(int256 wad) external view override returns (int256) {
        return wad / scaler;
    }

    /**
     * @notice Returns the current SMA price and an empty bytes array
     * @dev Required by the `IOracleWrapper` interface. The interface leaves
     *          the metadata as implementation-defined. For the SMA oracle, there
     *          is no clear use case for additional data, so it's left blank
     */
    function getPriceAndMetadata() external view override returns (int256 _price, bytes memory _data) {
        return (price, "");
    }
}
