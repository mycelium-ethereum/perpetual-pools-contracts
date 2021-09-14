// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IAdministrator {
    event Paused();
    event Unpaused();
    event Withdrew();

    function pause() external payable returns (uint256);

    function unpause() external payable returns (uint256);

    function withdraw() external payable returns (uint256);
}
