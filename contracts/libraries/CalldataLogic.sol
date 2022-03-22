//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IPoolCommitter.sol";

/// @title CalldataLogic library
/// @notice Library to decode calldata, used to optimize calldata size in PerpetualPools for L2 transaction cost reduction
library CalldataLogic {
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

        assembly {
            amount := and(args, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            commitType := and(shr(128, args), 0xFF)
            fromAggregateBalance := and(shr(136, args), 0xFF)
            payForClaim := and(shr(144, args), 0xFF)
        }
        return (amount, commitType, fromAggregateBalance, payForClaim);
    }
}
