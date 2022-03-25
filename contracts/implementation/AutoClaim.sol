//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IPoolFactory.sol";
import "../interfaces/IPoolCommitter.sol";
import "../interfaces/IAutoClaim.sol";

import "@openzeppelin/contracts/utils/Address.sol";

import "../libraries/CalldataLogic.sol";

/// @title The contract to be used for paying to have a keeper claim your commit automatically
/// @notice The way this works is when a user commits with `PoolCommitter::commit`, they have the option to set the `bool payForClaim` parameter to `true`.
///         During this function execution, `AutoClaim::payForClaim` is called, and `msg.value` is taken as the reward to whoever claims for requester (by using `AutoClaim::paidClaim`).
/// @dev A question I had to ask was "What happens if one requests a second claim before one's pending request from a previous update interval one gets executed on?".
///      My solution to this was to have the committer instantly claim for themself. They have signified their desire to claim their tokens, after all.
contract AutoClaim is IAutoClaim {
    // User => PoolCommitter address => Claim Request
    mapping(address => mapping(address => ClaimRequest)) public claimRequests;
    IPoolFactory internal poolFactory;

    modifier onlyPoolCommitter() {
        require(poolFactory.isValidPoolCommitter(msg.sender), "msg.sender not valid PoolCommitter");
        _;
    }

    constructor(address _poolFactoryAddress) {
        require(_poolFactoryAddress != address(0), "PoolFactory address == 0");
        poolFactory = IPoolFactory(_poolFactoryAddress);
    }

    /**
     * @notice Pay for your commit to be claimed. This means that a willing participant can claim on `user`'s behalf when the current update interval ends. Claims a previously pending and claimable request before creating the requested claim-request.
     * @dev Only callable by this contract's associated PoolCommitter instance. This prevents griefing. Consider a permissionless function, where a user can claim that somebody else wants to auto claim when they do not.
     * @dev Emits a `PaidRequestExecution` event on successful claim for pending commit.
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
                uint256 reward = request.reward;
                delete claimRequests[user][msg.sender];
                poolCommitter.claim(user);
                if (reward > 0) {
                    Address.sendValue(payable(user), reward);
                }
                emit PaidRequestExecution(user, msg.sender, request.reward);
            } else {
                // If the claim request is pending but not yet valid (it was made in the current commit), we want to add to the value.
                // Note that in context, the user *usually* won't need or want to increment `ClaimRequest.reward` more than once because the first call to `payForClaim` should suffice.
                request.reward += msg.value;
                emit PaidClaimRequestUpdate(user, msg.sender, request.reward);
                return;
            }
        }

        // If no previous claim requests are pending, we need to make a new one.
        requestUpdateIntervalId = poolCommitter.getAppropriateUpdateIntervalId();
        request.updateIntervalId = requestUpdateIntervalId;
        request.reward = msg.value;
        emit PaidClaimRequestUpdate(user, msg.sender, request.reward);
    }

    /**
     * @notice Claim on the behalf of a user who has requested to have their commit automatically claimed by a keeper.
     * @param user The user who requested an autoclaim.
     * @param poolCommitterAddress The PoolCommitter address within which the user's claim will be executed
     */
    function paidClaim(address user, address poolCommitterAddress) public override {
        require(poolFactory.isValidPoolCommitter(poolCommitterAddress), "Invalid PoolCommitter");
        IPoolCommitter poolCommitter = IPoolCommitter(poolCommitterAddress);
        uint256 currentUpdateIntervalId = poolCommitter.updateIntervalId();
        uint256 reward = claim(user, poolCommitterAddress, poolCommitter, currentUpdateIntervalId);
        if (reward > 0) {
            Address.sendValue(payable(msg.sender), reward);
        }
    }

    /**
     * @notice Claim on the behalf of a user who has requested to have their commit automatically claimed by a keeper.
     * @dev Does not transfer the reward, but instead returns the reward amount. This is a private function and is used to batch multiple reward transfers into one.
     */
    function claim(
        address user,
        address poolCommitterAddress,
        IPoolCommitter poolCommitter,
        uint256 currentUpdateIntervalId
    ) private returns (uint256) {
        ClaimRequest memory request = claimRequests[user][poolCommitterAddress];
        // Check if a previous claim request has been made, and if it is claimable.
        if (checkClaim(request, currentUpdateIntervalId)) {
            // Send the reward to msg.sender.
            // delete the ClaimRequest from storage
            delete claimRequests[user][poolCommitterAddress];
            // execute the claim
            poolCommitter.claim(user);
            emit PaidRequestExecution(user, poolCommitterAddress, request.reward);
            return request.reward;
        }
        return 0;
    }

    /**
     * @notice Call `paidClaim` for multiple users, across multiple PoolCommitters.
     * @param args1 Arguments for the function packed into a bytes array.
     *                        __
     *                       /  |
     *    __ _ _ __ __ _ ___ `| |     _______________________________________________________________________________________________________________________
     *   / _` | '__/ _` / __| | |    |          20 bytes          |          20 bytes         |          20 bytes          |          20 bytes         | ... |
     *  | (_| | | | (_| \__ \_| |_   |      0th user address      |     1st user address      |      3rd user address      |      4th user address     | ... |
     *   \__,_|_|  \__, |___/\___/    ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
     *              __/ |
     *             |___/
     *                       ___
     *                      |__ \
     *    __ _ _ __ __ _ ___   ) |    _______________________________________________________________________________________________________________________
     *   / _` | '__/ _` / __| / /    |          20 bytes          |          20 bytes         |          20 bytes          |          20 bytes         | ... |
     *  | (_| | | | (_| \__ \/ /_    |  0th poolCommitter address | 1st poolCommitter address |  3rd poolCommitter address | 4th poolCommitter address | ... |
     *   \__,_|_|  \__, |___/____|    ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
     *              __/ |
     *             |___/
     *
     * @dev The nth address in args2 should be the address of the PoolCommitter where the nth address in args1 requested an auto claim.
     */
    function multiPaidClaimMultiplePoolCommitters(bytes calldata args1, bytes calldata args2) external override {
        require(args1.length % CalldataLogic.ADDRESS_LENGTH == 0, "args must only include addresses");
        require(args1.length == args2.length, "args must be same length");
        uint256 reward;
        uint256 nrUsers = args1.length / CalldataLogic.ADDRESS_LENGTH;
        uint256 poolCommittersOffset;
        uint256 userOffset;
        uint256 currentUpdateIntervalId;

        assembly {
            poolCommittersOffset := args2.offset
            userOffset := args1.offset
        }

        address user;
        address poolCommitterAddress;
        for (uint256 i; i < nrUsers; ) {
            // Fetch the next addresses
            user = CalldataLogic.getAddressAtOffset(userOffset);
            poolCommitterAddress = CalldataLogic.getAddressAtOffset(poolCommittersOffset);

            // Make sure this PoolCommitter is one which has been deployed by the factory
            require(poolFactory.isValidPoolCommitter(poolCommitterAddress), "Invalid pool committer contract");
            IPoolCommitter poolCommitter = IPoolCommitter(poolCommitterAddress);

            // Get the update interval ID of the pool committer we are using
            currentUpdateIntervalId = poolCommitter.updateIntervalId();
            reward += claim(user, poolCommitterAddress, poolCommitter, currentUpdateIntervalId);

            unchecked {
                ++i;
                // The offset of the next addresses will be ADDRESS_LENGTH (20) bytes across
                userOffset += CalldataLogic.ADDRESS_LENGTH;
                poolCommittersOffset += CalldataLogic.ADDRESS_LENGTH;
            }
        }
        if (reward > 0) {
            Address.sendValue(payable(msg.sender), reward);
        }
    }

    /**
     * @notice Call `paidClaim` for multiple users, in a single PoolCommitter.
     * @param args Arguments for the function packed into a bytes array. Generated with L2Encoder.encode
     *  _______________________________________________________________________________________________________________________
     * |          20 bytes          |          20 bytes         |          20 bytes          |          20 bytes         | ... |
     * |      0th user address      |     1st user address      |      3rd user address      |      4th user address     | ... |
     *  ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
     * @param poolCommitterAddress The PoolCommitter address within which you would like to claim for the respective user
     * @dev poolCommitterAddress should be the PoolCommitter where the all supplied user addresses requested an auto claim
     */
    function multiPaidClaimSinglePoolCommitter(bytes calldata args, address poolCommitterAddress) external override {
        require(args.length % 20 == 0, "args must only include addresses");

        uint256 nrUsers = args.length / 20;
        uint256 userOffset;
        assembly {
            userOffset := args.offset
        }

        address user;
        uint256 reward;
        require(poolFactory.isValidPoolCommitter(poolCommitterAddress), "Invalid pool committer contract");
        IPoolCommitter poolCommitter = IPoolCommitter(poolCommitterAddress);
        uint256 currentUpdateIntervalId = poolCommitter.updateIntervalId();
        for (uint256 i; i < nrUsers; ) {
            user = CalldataLogic.getAddressAtOffset(userOffset);
            reward += claim(user, poolCommitterAddress, poolCommitter, currentUpdateIntervalId);

            unchecked {
                ++i;
                userOffset += CalldataLogic.ADDRESS_LENGTH;
            }
        }
        if (reward > 0) {
            Address.sendValue(payable(msg.sender), reward);
        }
    }

    /**
     * @notice If a user's claim request never gets executed (due to not high enough of a reward), or they change their minds, enable them to withdraw their request.
     * @param poolCommitter The PoolCommitter for which the user's commit claim is to be withdrawn.
     * @dev Emits a `RequestWithdrawn` event on success
     */
    function withdrawClaimRequest(address poolCommitter) external override {
        require(poolFactory.isValidPoolCommitter(poolCommitter), "Invalid pool committer contract");
        if (claimRequests[msg.sender][poolCommitter].updateIntervalId > 0) {
            uint256 reward = claimRequests[msg.sender][poolCommitter].reward;
            delete claimRequests[msg.sender][poolCommitter];
            if (reward > 0) {
                Address.sendValue(payable(msg.sender), reward);
            }
            emit RequestWithdrawn(msg.sender, poolCommitter);
        }
    }

    /**
     * @notice When the user claims themself through poolCommitter, you want the user to be able to withdraw their request through the poolCommitter as msg.sender
     * @param user The user who will have their claim request withdrawn.
     * @dev Only callable by the associated `PoolCommitter` contract
     */

    function withdrawUserClaimRequest(address user) public override onlyPoolCommitter {
        // msg.sender is the PoolCommitter
        uint256 reward = claimRequests[user][msg.sender].reward;
        delete claimRequests[user][msg.sender];
        if (reward > 0) {
            Address.sendValue(payable(user), reward);
        }
    }

    /**
     * @notice Check the validity of a user's claim request for a given pool committer.
     * @return true if the claim request can be executed.
     * @param user The user whose claim request will be checked.
     * @param poolCommitter The pool committer in which to look for a user's claim request.
     */
    function checkUserClaim(address user, address poolCommitter) external view override returns (bool) {
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

    receive() external payable {
        revert();
    }

    fallback() external payable {
        revert();
    }
}
