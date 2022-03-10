// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ITracerDevMultisig {
    /**
     * @notice Proposes a function execution on a contract by the governance contract.
     * @param targets the target contracts to execute the proposalData on.
     */
    function propose(address[] memory targets, bytes[] memory proposalData) external;

    /**
     * @notice Executes a given proposal.
     * @dev Ensures execution succeeds but ignores return data.
     * @param proposalId the id of the proposal to execute.
     */
    function execute(uint256 proposalId) external;

    /**
     * @notice Allows a staker to vote on a given proposal. A staker may vote multiple times,
               and vote on either or both sides. A vote may not be revoked once made.
     * @param proposalId the id of the proposal to be voted on.
     * @param userVote the vote on this proposal. True for yes, False for no.
     */
    function vote(uint256 proposalId, bool userVote) external;
}
