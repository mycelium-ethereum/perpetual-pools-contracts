// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./IChainlinkOracle.sol";

/**
 * @dev The following is a mock Chainlink Price Feed Implementation.
 *      It is used purely for the purpose of testing.
 *      All Chainlink price feeds should be wrapped in a Tracer Chainlink Adapter
 *      to ensure answers are returned in WAD format.
 *      see contracts/oracle/ChainlinkOracleAdapter.sol.
 */
contract ChainlinkOracle is IChainlinkOracle {
    int256 public price = 100000000;
    uint8 public override decimals = 8; // default of 8 decimals for USD price feeds in the Chainlink ecosystem
    string public override description = "A mock Chainlink V3 Aggregator";
    uint256 public override version = 3; // Aggregator V3;
    uint80 private constant ROUND_ID = 1; // A mock round Id

    /**
     * @notice Returns round data with the set price as the answer.
     *         Other fields are returned as mock data to simulate a
     *         successful round.
     */
    function latestRoundData()
        external
        view
        override
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