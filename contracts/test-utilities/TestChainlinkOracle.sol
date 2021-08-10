// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

/**
 * @dev The following is a mock Chainlink Price Feed Implementation.
 *      It is used purely for the purpose of testing.
 *      DO NOT USE IN PRODUCTION
 */
contract TestChainlinkOracle {
    int256 public price = 100000000;
    uint8 public decimals = 8; // default of 8 decimals for USD price feeds in the Chainlink ecosystem
    string public description = "A mock Chainlink V3 Aggregator";
    uint256 public version = 3; // Aggregator V3;
    uint80 private ROUND_ID = 1; // A mock round Id

    /**
     * @notice Returns round data with the set price as the answer.
     *         Other fields are returned as mock data to simulate a
     *         successful round.
     */
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = ROUND_ID;
        answer = price;
        startedAt = 0;
        updatedAt = block.timestamp;
        answeredInRound = ROUND_ID;

        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }

    /**
     * @notice Sets the answer that is returned by the Oracle when latestRoundData is called
     */
    function setPrice(int256 _price) public {
        price = _price;
    }

    /**
     * @notice Sets the decimals returned in the answer
     */
    function setDecimals(uint8 _decimals) external {
        decimals = _decimals;
    }
}
