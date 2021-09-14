// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IAdministrator {
    event Paused();
    event Unpaused();
    event Withdrew();

    function pause() external;
    function unpause() external;
    function withdraw() external;
}
