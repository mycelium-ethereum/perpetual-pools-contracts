//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../../interfaces/IOracleWrapper.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV2V3Interface.sol";

/// @title The oracle management contract for chainlink V3 oracles
contract TwoAggregateChainlinkOracleWrapper is IOracleWrapper {
    // #### Globals

    /*
     * E.g. if oracle1 is ETH/USD, oracle2 is BTC/USDS
     * oracle1 gives how many USD per ETH (i.e. it's units are USD/ETH)
     * oracle2 gives how many USD per BTC (i.e. it's units are USD/BTC)
     * So, if you divide oracle1 by oracle2, you get
     *      (USD/ETH) / (USD/BTC)
     *    = (USD/ETH) * (BTC/USD)
     *    = (USD*BTC) / (USD*ETH)
     *    = BTC / ETH
     * i.e. the $BTC per $ETH -> ETH/BTC price feed
     */

    /**
     * @notice The address of the feed oracle
     */
    address public oracle1;
    address public oracle2;
    // We need this in order to conform to the IOracleWrapper interface, but we use two oracles.
    // This will just be the zero address
    address public override oracle;
    address public immutable override deployer;
    uint8 private constant MAX_DECIMALS = 18;
    int256 public scaler1;
    int256 public scaler2;

    // #### Functions
    constructor(
        address _oracle1,
        address _oracle2,
        address _deployer
    ) {
        require(_oracle1 != address(0), "Oracle cannot be null");
        require(_oracle2 != address(0), "Oracle cannot be null");
        require(_deployer != address(0), "Deployer cannot be null");
        oracle1 = _oracle1;
        oracle2 = _oracle2;
        deployer = _deployer;
        // reset the scaler for consistency
        uint8 _decimals1 = AggregatorV2V3Interface(oracle1).decimals();
        uint8 _decimals2 = AggregatorV2V3Interface(oracle2).decimals();
        require(_decimals1 <= MAX_DECIMALS, "COA: too many decimals");
        require(_decimals2 <= MAX_DECIMALS, "COA: too many decimals");
        // scaler is always <= 10^18 and >= 1 so this cast is safe
        unchecked {
            scaler1 = int256(10**(MAX_DECIMALS - _decimals1));
            scaler2 = int256(10**(MAX_DECIMALS - _decimals2));
        }
    }

    function decimals() external pure override returns (uint8) {
        return MAX_DECIMALS;
    }

    /**
     * @notice Returns the oracle price in WAD format
     */
    function getPrice() external view override returns (int256) {
        (int256 _price1, ) = _latestRoundData1();
        (int256 _price2, ) = _latestRoundData2();

        return (_price1 * int256(10**MAX_DECIMALS)) / _price2;
    }

    /**
     * @return _price The latest round data price
     * @return _data The metadata. Implementations can choose what data to return here. This implementation returns the roundID
     */
    function getPriceAndMetadata() external view override returns (int256, bytes memory) {
        (int256 price, uint80 roundID) = _latestRoundData1();
        bytes memory _data = abi.encodePacked(roundID);
        return (price, _data);
    }

    /**
     * @dev An internal function that gets the WAD value price and latest roundID
     */
    function _latestRoundData1() internal view returns (int256, uint80) {
        (uint80 roundID, int256 price, , uint256 timeStamp, uint80 answeredInRound) = AggregatorV2V3Interface(oracle1)
            .latestRoundData();
        require(answeredInRound >= roundID, "COA: Stale answer");
        require(timeStamp != 0, "COA: Round incomplete");
        return (toWad1(price), roundID);
    }

    /**
     * @dev An internal function that gets the WAD value price and latest roundID
     */
    function _latestRoundData2() internal view returns (int256, uint80) {
        (uint80 roundID, int256 price, , uint256 timeStamp, uint80 answeredInRound) = AggregatorV2V3Interface(oracle2)
            .latestRoundData();
        require(answeredInRound >= roundID, "COA: Stale answer");
        require(timeStamp != 0, "COA: Round incomplete");
        return (toWad2(price), roundID);
    }

    /**
     * @notice Converts a raw value to a WAD value based on the decimals in the feed
     * @dev This allows consistency for oracles used throughout the protocol
     *      and allows oracles to have their decimals changed without affecting
     *      the market itself
     */
    function toWad1(int256 raw) internal view returns (int256) {
        return raw * scaler1;
    }

    /**
     * @notice Converts a raw value to a WAD value based on the decimals in the feed
     * @dev This allows consistency for oracles used throughout the protocol
     *      and allows oracles to have their decimals changed without affecting
     *      the market itself
     */
    function toWad2(int256 raw) internal view returns (int256) {
        return raw * scaler2;
    }

    /**
     * @notice Converts from a WAD value to a raw value based on the decimals in the feed
     * @dev Unused, but it's in the interface :(
     */
    function fromWad(int256 wad) external view override returns (int256) {
        return wad / scaler1;
    }

    function poll() external pure override returns (int256) {
        return 0;
    }
}
