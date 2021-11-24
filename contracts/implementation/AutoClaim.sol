//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IPoolCommitter.sol";
import "../interfaces/IAutoClaim.sol";

/// @title The contract to be used for paying to have a keeper claim your commit automatically
/// @notice The way this works is when a user commits with `PoolCommitter::commit`, they have the option to set the `bool payForClaim` parameter to `true`.
///         During this function execution, `AutoClaim::payForClaim` is called, and `msg.value` is taken as the reward to whoever claims for requester (by using `AutoClaim::payedClaim`).
/// @dev A question I had to ask was "What happens if one requests a second claim before one's pending request from a previous update interval one gets executed on?".
///      My solution to this was to have the committer instantly claim for themself. They have signified their desire to claim their tokens, after all.
contract AutoClaim is IAutoClaim {
    mapping(address => ClaimRequest) claimRequests;
    address internal poolCommitterAddress;
    IPoolCommitter internal poolCommitter;

    constructor(address _poolCommitterAddress) {
        require(_poolCommitterAddress != address(0), "PoolCommitter address == 0");
        poolCommitterAddress = _poolCommitterAddress;
        poolCommitter = IPoolCommitter(_poolCommitterAddress);
    }

    /**
     * @notice Pay for your commit to be claimed. This means that a willing participant can claim on `user`'s behalf when the current update interval ends.
     * @dev Only callable by this contract's associated PoolCommitter instance. This prevents griefing. Consider a permissionless function, where a user can claim that somebody else wants to auto claim when they do not.
     * @param user The user who wants to autoclaim.
     */
    function makePaidClaimRequest(address user) external payable override onlyPoolCommitter {
        ClaimRequest storage request = claimRequests[user];

        uint256 requestUpdateIntervalId = request.updateIntervalId;
        // Check if a previous claim request is pending...
        if (requestUpdateIntervalId > 0) {
            // and if it is claimable (the current update interval is greater than the one where the request was made).
            if (requestUpdateIntervalId < poolCommitter.updateIntervalId()) {
                // If so, this person may as well claim for themself (if allowed). They have signified their want of claim, after all.
                // Note that this function is only called by PoolCommitter when a user `commits` and therefore `user` will always equal the original `msg.sender`.
                // send(msg.sender, request.reward);
                delete claimRequests[user];
                poolCommitter.claim(user);
            } else {
                // If the claim request is pending but not yet valid (it was made in the current commit), we want to add to the value.
                // Note that in context, the user *usually* won't need or want to increment `ClaimRequest.reward` more than once because the first call to `payForClaim` should suffice.
                request.reward += msg.value;
            }
        } else {
            // If no previous claim requests are pending, we need to make a new one.
            request.updateIntervalId = poolCommitter.updateIntervalId();
            request.reward = msg.value;
        }
    }

    /**
     * @notice Claim on the behalf of a user who has requests to have their commit automatically claimed by a keeper.
     * @param user The user who requested an autoclaim.
     */
    function payedClaim(address user) external override {
        ClaimRequest memory request = claimRequests[user];
        uint256 currentUpdateIntervalId = poolCommitter.updateIntervalId();
        // Check if a previous claim request has been made, and if it is claimable.
        if (checkClaim(request, currentUpdateIntervalId)) {
            // Send the reward to msg.sender.
            // send(msg.sender, request.reward);
            // delete the ClaimRequest from storage
            delete claimRequests[user];
            // execute the claim
            poolCommitter.claim(user);
        }
    }

    /**
     * @return true if the given claim request can be executed.
     * @dev A claim request can be executed only if one exists and is from an update interval that has passed.
     * @param request The ClaimRequest object to be checked.
     * @param currentUpdateIntervalId The current update interval. Used to compare to the update interval of the ClaimRequest.
     */
    function checkClaim(ClaimRequest memory request, uint256 currentUpdateIntervalId)
        public
        pure
        override
        returns (bool)
    {
        return request.updateIntervalId > 0 && request.updateIntervalId < currentUpdateIntervalId;
    }

    modifier onlyPoolCommitter() {
        require(msg.sender == poolCommitterAddress, "msg.sender != poolCommitter");
        _;
    }
}
