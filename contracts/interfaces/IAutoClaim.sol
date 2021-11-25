//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

interface IAutoClaim {
    event PaidClaimRequest(
        address indexed user,
        address indexed poolCommitter,
        uint256 indexed updateIntervalId,
        uint256 reward
    );
    event PaidClaimRequestUpdate(address indexed user, address indexed poolCommitter, uint256 indexed newReward);
    event PaidRequestExecution(address user, uint256 reward);

    struct ClaimRequest {
        uint128 updateIntervalId; // The update interval during which a user requested a claim.
        uint256 reward; // The amount of ETH in wei that was given by the user to pay for upkeep
    }

    function initialize(address _poolFactoryAddress) external;

    /**
     * @notice Pay for your commit to be claimed. This means that a willing participant can claim on `user`'s behalf when the current update interval ends.
     * @dev Only callable by this contract's associated PoolCommitter instance. This prevents griefing. Consider a permissionless function, where a user can claim that somebody else wants to auto claim when they do not.
     * @param user The user who wants to autoclaim.
     */
    function makePaidClaimRequest(address user) external payable;

    /**
     * @notice Claim on the behalf of a user who has requests to have their commit automatically claimed by a keeper.
     * @param user The user who requested an autoclaim.
     * @param poolCommitterAddress The PoolCommitter address within which the user's claim will be executed
     */
    function paidClaim(address user, address poolCommitterAddress) external;

    /**
     * @notice Call `paidClaim` for multiple users, across multiple PoolCommitters
     * @param users All users to execute claims for.
     * @param poolCommitterAddresses The PoolCommitter addresses within which you would like to claim for the respective user
     * @dev The nth index in poolCommitterAddresses should be the PoolCommitter where the nth address in user requested an auto claim
     */
    function multiPaidClaimMultiplePoolCommitters(address[] calldata users, address[] calldata poolCommitterAddresses)
        external;

    /**
     * @notice Call `paidClaim` for multiple users, in a single PoolCommitter.
     * @dev The nth index in poolCommitterAddresses should be the PoolCommitter where the nth address in user requested an auto claim
     * @param users All users to execute claims for.
     * @param poolCommitterAddress The PoolCommitter address within which you would like to claim for the respective user
     */
    function multiPaidClaimSinglePoolCommitter(address[] calldata users, address poolCommitterAddress) external;

    /**
     * @notice If a user's claim request never gets executed (due to not high enough of a reward), or they change their minds, enable them to withdraw their request.
     * @param poolCommitter The PoolCommitter for which the user's commit claim is to be withdrawn.
     */
    function withdrawClaimRequest(address poolCommitter) external;

    /**
     * @notice When the user claims themself through poolCommitter, you want the
     * @param user The user who will have their claim request withdrawn.
     */
    function withdrawUserClaimRequest(address user) external;

    /**
     * @notice Check the validity of a user's claim request for a given pool committer.
     * @return true if the claim request can be executed.
     * @param user The user whose claim request will be checked.
     * @param poolCommitter The pool committer in which to look for a user's claim request.
     */
    function checkUserClaim(address user, address poolCommitter) external view returns (bool);

    /**
     * @return true if the given claim request can be executed.
     * @dev A claim request can be executed only if one exists and is from an update interval that has passed.
     * @param request The ClaimRequest object to be checked.
     * @param currentUpdateIntervalId The current update interval. Used to compare to the update interval of the ClaimRequest.
     */
    function checkClaim(ClaimRequest memory request, uint256 currentUpdateIntervalId) external pure returns (bool);
}
