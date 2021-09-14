// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IAdministrator {
    event Paused();
    event Unpaused();
    event Withdrew();

    function pause(address pool) external payable returns (uint256);

    function unpause(address pool) external payable returns (uint256);

    function withdraw(address pool) external payable returns (uint256);
}
