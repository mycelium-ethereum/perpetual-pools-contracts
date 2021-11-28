//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IPoolFactory.sol";
import "../interfaces/IPoolCommitter.sol";
import "../interfaces/IAutoClaim.sol";

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @title The contract to be used for paying to have a keeper claim your commit automatically
/// @notice The way this works is when a user commits with `PoolCommitter::commit`, they have the option to set the `bool payForClaim` parameter to `true`.
///         During this function execution, `AutoClaim::payForClaim` is called, and `msg.value` is taken as the reward to whoever claims for requester (by using `AutoClaim::paidClaim`).
/// @dev A question I had to ask was "What happens if one requests a second claim before one's pending request from a previous update interval one gets executed on?".
///      My solution to this was to have the committer instantly claim for themself. They have signified their desire to claim their tokens, after all.
contract AutoClaim is IAutoClaim, Initializable {
    // User => PoolCommitter address => Claim Request
    mapping(address => mapping(address => ClaimRequest)) public claimRequests;
    IPoolFactory internal poolFactory;

    constructor(address _poolFactoryAddress) {
        require(_poolFactoryAddress != address(0), "PoolFactory address == 0");
        poolFactory = IPoolFactory(_poolFactoryAddress);
    }

    function initialize(address _poolFactoryAddress) external override initializer {
        require(_poolFactoryAddress != address(0), "PoolFactory address == 0");
        poolFactory = IPoolFactory(_poolFactoryAddress);
    }

    /**
     * @notice Pay for your commit to be claimed. This means that a willing participant can claim on `user`'s behalf when the current update interval ends.
     * @dev Only callable by this contract's associated PoolCommitter instance. This prevents griefing. Consider a permissionless function, where a user can claim that somebody else wants to auto claim when they do not.
     * @param user The user who wants to autoclaim.
     */
    function makePaidClaimRequest(address user) external payable override onlyPoolCommitter {
        ClaimRequest storage request = claimRequests[user][msg.sender];
        IPoolCommitter poolCommitter = IPoolCommitter(msg.sender);

        uint128 requestUpdateIntervalId = request.updateIntervalId;
        // Check if a previous claim request is pending...
        if (requestUpdateIntervalId > 0) {
            // and if it is claimable (the current update interval is greater than the one where the request was made).
            if (requestUpdateIntervalId < poolCommitter.updateIntervalId()) {
                // If so, this person may as well claim for themself (if allowed). They have signified their want of claim, after all.
                // Note that this function is only called by PoolCommitter when a user `commits` and therefore `user` will always equal the original `msg.sender`.
                payable(user).transfer(claimRequests[user][msg.sender].reward);
                delete claimRequests[user][msg.sender];
                poolCommitter.claim(user);
            } else {
                // If the claim request is pending but not yet valid (it was made in the current commit), we want to add to the value.
                // Note that in context, the user *usually* won't need or want to increment `ClaimRequest.reward` more than once because the first call to `payForClaim` should suffice.
                request.reward += msg.value;
                emit PaidClaimRequestUpdate(user, msg.sender, msg.value);
                return;
            }
        }

        // If no previous claim requests are pending, we need to make a new one.
        requestUpdateIntervalId = poolCommitter.updateIntervalId();
        claimRequests[user][msg.sender].updateIntervalId = requestUpdateIntervalId;
        claimRequests[user][msg.sender].reward = msg.value;
        emit PaidClaimRequestUpdate(user, msg.sender, msg.value);
    }

    /**
     * @notice Claim on the behalf of a user who has requests to have their commit automatically claimed by a keeper.
     * @param user The user who requested an autoclaim.
     * @param poolCommitterAddress The PoolCommitter address within which the user's claim will be executed
     */
    function paidClaim(address user, address poolCommitterAddress) public override {
        ClaimRequest memory request = claimRequests[user][poolCommitterAddress];
        IPoolCommitter poolCommitter = IPoolCommitter(poolCommitterAddress);
        uint256 currentUpdateIntervalId = poolCommitter.updateIntervalId();
        // Check if a previous claim request has been made, and if it is claimable.
        if (checkClaim(request, currentUpdateIntervalId)) {
            // Send the reward to msg.sender.
            payable(msg.sender).transfer(request.reward);
            // delete the ClaimRequest from storage
            delete claimRequests[user][poolCommitterAddress];
            // execute the claim
            poolCommitter.claim(user);
            emit PaidRequestExecution(user, request.reward);
        }
    }

    /**
     * @notice Call `paidClaim` for multiple users, across multiple PoolCommitters.
     * @param users All users to execute claims for.
     * @param poolCommitterAddresses The PoolCommitter addresses within which you would like to claim for the respective user.
     * @dev The nth index in poolCommitterAddresses should be the PoolCommitter where the nth address in user requested an auto claim.
     */
    function multiPaidClaimMultiplePoolCommitters(address[] calldata users, address[] calldata poolCommitterAddresses)
        external
        override
    {
        require(users.length == poolCommitterAddresses.length, "Supplied arrays must be same length");
        for (uint256 i = 0; i < users.length; i++) {
            paidClaim(users[i], poolCommitterAddresses[i]);
        }
    }

    /**
     * @notice Call `paidClaim` for multiple users, in a single PoolCommitter.
     * @param users All users to execute claims for.
     * @param poolCommitterAddress The PoolCommitter address within which you would like to claim for the respective user
     * @dev The nth index in poolCommitterAddresses should be the PoolCommitter where the nth address in user requested an auto claim
     */
    function multiPaidClaimSinglePoolCommitter(address[] calldata users, address poolCommitterAddress)
        external
        override
    {
        for (uint256 i = 0; i < users.length; i++) {
            paidClaim(users[i], poolCommitterAddress);
        }
    }

    // todo add ufnction for msg.sender to make their own autoclaim request outside of commitment

    /**
     * @notice If a user's claim request never gets executed (due to not high enough of a reward), or they change their minds, enable them to withdraw their request.
     * @param poolCommitter The PoolCommitter for which the user's commit claim is to be withdrawn.
     */
    function withdrawClaimRequest(address poolCommitter) external override {
        if (checkUserClaim(msg.sender, poolCommitter)) {
            payable(msg.sender).transfer(claimRequests[msg.sender][poolCommitter].reward);
            delete claimRequests[msg.sender][poolCommitter];
        }
    }

    /**
     * @notice When the user claims themself through poolCommitter, you want the
     * @param user The user who will have their claim request withdrawn.
     */
    function withdrawUserClaimRequest(address user) public override onlyPoolCommitter {
        payable(user).transfer(claimRequests[user][msg.sender].reward);
        delete claimRequests[user][msg.sender];
    }

    /**
     * @notice Check the validity of a user's claim request for a given pool committer.
     * @return true if the claim request can be executed.
     * @param user The user whose claim request will be checked.
     * @param poolCommitter The pool committer in which to look for a user's claim request.
     */
    function checkUserClaim(address user, address poolCommitter) public view override returns (bool) {
        return checkClaim(claimRequests[user][poolCommitter], IPoolCommitter(poolCommitter).updateIntervalId());
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
        require(poolFactory.isValidPoolCommitter(msg.sender), "msg.sender not valid PoolCommitter");
        _;
    }
}
