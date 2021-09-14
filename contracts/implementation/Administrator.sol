// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "arbitrum-tutorials/packages/arb-shared-dependencies/contracts/Inbox.sol";
import "arbitrum-tutorials/packages/arb-shared-dependencies/contracts/Outbox.sol";

import "../interfaces/IAdministrator.sol";
import "../implementation/LeveragedPool.sol";

contract Administrator is Ownable, IAdministrator {
    address public target;
    IInbox public inbox;

    constructor(address _target) {
        require(_target != address(0), "Target address cannot be null");
        target = _target;
    }

    function setTarget(address _target) external onlyOwner {
        require(_target != address(0), "Target address cannot be null");
        target = _target;
    }

    function callL2(bytes memory payload) public payable onlyOwner returns (uint256) {
        uint256 max_submission_cost = 1;
        uint256 max_gas = 1;
        uint256 gas_price_bid = 1;

        /* create retryable ticket in the L2 inbox */
        uint256 ticket_id = inbox.createRetryableTicket{value: msg.value}(
            target,
            0,
            max_submission_cost,
            msg.sender,
            msg.sender,
            max_gas,
            gas_price_bid,
            payload
        );

        return ticket_id;
    }

    /**
     * @notice Pauses the pool on L2
     * @dev Submits a message to the L2 inbox
     */
    function pause() external payable override onlyOwner returns (uint256) {
        /* construct desired call data */
        bytes memory data = abi.encodeWithSelector(LeveragedPool.pause.selector);

        /* perform the call to L2 */
        uint256 ticket_id = callL2(data);

        return ticket_id;
    }

    function unpause() external payable override onlyOwner returns (uint256) {
        /* construct desired call data */
        bytes memory data = abi.encodeWithSelector(LeveragedPool.unpause.selector);

        /* perform the call to L2 */
        uint256 ticket_id = callL2(data);

        return ticket_id;
    }

    function withdraw() external payable override onlyOwner returns (uint256) {
        /* construct desired call data */
        bytes memory data = abi.encodeWithSelector(LeveragedPool.withdrawQuote.selector);

        /* perform the call to L2 */
        uint256 ticket_id = callL2(data);

        return ticket_id;
    }
}
