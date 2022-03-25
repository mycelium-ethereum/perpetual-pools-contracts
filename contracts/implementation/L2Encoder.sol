//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "../interfaces/IPoolCommitter.sol";

/**
 * @title L2Encoder
 * @notice Helper contract to encode calldata, used to optimize calldata size
 * only indented to help generate calldata for uses/frontends.
 */
contract L2Encoder {
    using SafeCast for uint256;

    /**
     * @notice Encodes an array of addresses to compact representation as a bytes array
     * @param args The array of LeveragedPool addresses to perform upkeep on
     * @return compact bytes array of addresses
     */
    function encodeAddressArray(address[] calldata args) external pure returns (bytes memory) {
        bytes memory encoded;
        uint256 len = args.length;
        for (uint256 i = 0; i < len; i++) {
            encoded = bytes.concat(encoded, abi.encodePacked(args[i]));
        }
        return encoded;
    }

    /**
     * @notice Encodes commit parameters from standard input to compact representation of 1 bytes32
     * @param amount Amount of settlement tokens you want to commit to minting; OR amount of pool
     *               tokens you want to burn
     * @param commitType Type of commit you're doing (Long vs Short, Mint vs Burn)
     * @param fromAggregateBalance If minting, burning, or rebalancing into a delta neutral position,
     *                             will tokens be taken from user's aggregate balance?
     * @param payForClaim True if user wants to pay for the commit to be claimed
     * @return compact representation of commit parameters
     */
    function encodeCommitParams(
        uint256 amount,
        IPoolCommitter.CommitType commitType,
        bool fromAggregateBalance,
        bool payForClaim
    ) external pure returns (bytes32) {
        uint128 shortenedAmount = amount.toUint128();

        bytes32 res;

        assembly {
            res := add(
                shortenedAmount,
                add(shl(128, commitType), add(shl(136, fromAggregateBalance), shl(144, payForClaim)))
            )
        }
        return res;
    }
}
