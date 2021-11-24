//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

interface IAutoClaim {
    event PaidRequestClaim(address indexed user, uint256 indexed updateIntervalId, uint256 indexed reward);
    event PaidRequestExecution(address user, uint256 reward);

    struct ClaimRequest {
        uint128 updateIntervalId; // The update interval during which a user requested a claim.
        uint256 reward; // The amount of ETH in wei that was given by the user to pay for upkeep
    }

    /**
     * @notice Pay for your commit to be claimed. This means that a willing participant can claim on `user`'s behalf when the current update interval ends.
     * @dev Only callable by this contract's associated PoolCommitter instance. This prevents griefing. Consider a permissionless function, where a user can claim that somebody else wants to auto claim when they do not.
     * @param user The user who wants to autoclaim.
     */
    function makePaidClaimRequest(address user) external payable;

    /**
     * @notice Claim on the behalf of a user who has requests to have their commit automatically claimed by a keeper.
     * @param user The user who requested an autoclaim.
     */
    function payedClaim(address user) external;

    /**
     * @return true if the given claim request can be executed.
     * @dev A claim request can be executed only if one exists and is from an update interval that has passed.
     * @param request The ClaimRequest object to be checked.
     * @param currentUpdateIntervalId The current update interval. Used to compare to the update interval of the ClaimRequest.
     */
    function checkClaim(ClaimRequest memory request, uint256 currentUpdateIntervalId) external pure returns (bool);
}
