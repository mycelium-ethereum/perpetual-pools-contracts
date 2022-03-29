//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

interface IKeeperRewards {
    /**
     * @notice Creates a notification of a failed pool update
     * @param pool The pool that failed to update
     * @param reason The reason for the error
     */
    event PoolUpkeepError(address indexed pool, string reason);

    function payKeeper(
        address _keeper,
        address _pool,
        uint256 _gasPrice,
        uint256 _gasSpent,
        uint256 _savedPreviousUpdatedTimestamp,
        uint256 _updateInterval
    ) external returns (uint256);
}
