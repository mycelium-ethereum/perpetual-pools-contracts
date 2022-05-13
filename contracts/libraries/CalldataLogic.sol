//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IPoolCommitter.sol";

/// @title CalldataLogic library
/// @notice Library to decode calldata, used to optimize calldata size in PerpetualPools for L2 transaction cost reduction
library CalldataLogic {
    /*
     * Calldata when parameter is a tightly packed byte array looks like this:
     * -----------------------------------------------------------------------------------------------------
     * | function signature | offset of byte array | length of byte array |           bytes array           |
     * |      4 bytes       |       32 bytes       |       32 bytes       |  20 * number_of_addresses bytes |
     * -----------------------------------------------------------------------------------------------------
     *
     * If there are two bytes arrays, then it looks like
     * ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
     * | function signature | offset of 1st byte array | offset of 2nd byte array | length of 1st byte array |        1st bytes array          | length of 2nd byte array |        2nd bytes array          |
     * |      4 bytes       |        32 bytes          |        32 bytes          |         32 bytes         |  20 * number_of_addresses bytes |         32 bytes         |  20 * number_of_addresses bytes |
     * ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
     * and so on...
     * Note that the offset indicates where the length is indicated, and the actual array itself starts 32 bytes after that
     */
    // Length of address = 20
    uint16 internal constant ADDRESS_LENGTH = 20;

    function getAddressAtOffset(uint256 offset) internal pure returns (address) {
        bytes20 addressAtOffset;
        assembly {
            addressAtOffset := calldataload(offset)
        }
        return (address(addressAtOffset));
    }

    /**
     * @notice decodes compressed commit params to standard params
     * @param args The packed commit args
     * @return The amount of settlement or pool tokens to commit
     * @return The CommitType
     * @return Whether to make the commitment from user's aggregate balance
     * @return Whether to pay for an autoclaim or not
     */
    function decodeCommitParams(bytes32 args)
        internal
        pure
        returns (
            uint256,
            IPoolCommitter.CommitType,
            bool,
            bool
        )
    {
        uint256 amount;
        IPoolCommitter.CommitType commitType;
        bool fromAggregateBalance;
        bool payForClaim;

        // `amount` is implicitly capped at 128 bits.
        assembly {
            amount := and(args, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            commitType := and(shr(128, args), 0xFF)
            fromAggregateBalance := and(shr(136, args), 0xFF)
            payForClaim := and(shr(144, args), 0xFF)
        }
        return (amount, commitType, fromAggregateBalance, payForClaim);
    }
}
