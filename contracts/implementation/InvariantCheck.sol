//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IInvariantCheck.sol";
import "../interfaces/IPoolCommitter.sol";
import "../interfaces/IPausable.sol";
import "../interfaces/ILeveragedPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title The contract for checking invariants and pausing if necessary
/// @notice Every time certain functions are called, known invariants are checked and if any do not hold, contracts are paused.
contract InvariantCheck is IInvariantCheck {
    /**
     * @notice Checks all invariants, and pauses all contracts if
     *         any invariant does not hold.
     * @dev This should be called before onlyUnpaused, in case contracts are paused then pause check must happen after.
     */
    function checkInvariants(address poolToCheck) external override {
        ILeveragedPool pool = ILeveragedPool(poolToCheck);
        IPoolCommitter poolCommitter = IPoolCommitter(pool.poolCommitter());
        uint256 poolBalance = IERC20(pool.quoteToken()).balanceOf(poolToCheck);
        (
            IPoolCommitter.Commitment memory totalMostRecentCommits,
            IPoolCommitter.Commitment memory totalNextIntervalCommit
        ) = poolCommitter.getPendingCommits();
        uint256 pendingMints;
        unchecked {
            pendingMints =
                totalMostRecentCommits.longMintAmount +
                totalMostRecentCommits.shortMintAmount +
                totalNextIntervalCommit.longMintAmount +
                totalNextIntervalCommit.shortMintAmount;
        }
        uint256 longBalance = pool.longBalance();
        uint256 shortBalance = pool.shortBalance();
        if (!balanceInvariant(poolBalance, pendingMints, longBalance, shortBalance)) {
            pauseAll(IPausable(poolToCheck), IPausable(address(poolCommitter)));
        }
    }

    function pauseAll(IPausable pool, IPausable poolCommitter) internal {
        pool.pause();
        poolCommitter.pause();
    }

    /**
     * @notice Check that the balance of a pool is equal to or greater than the summation of pending mints, long balance and short balance
     * @return true if balance invariant holds. False if not
     */
    function balanceInvariant(
        uint256 balance,
        uint256 pendingMints,
        uint256 longBalance,
        uint256 shortBalance
    ) internal pure returns (bool) {
        return balance >= pendingMints + longBalance + shortBalance;
    }
}
