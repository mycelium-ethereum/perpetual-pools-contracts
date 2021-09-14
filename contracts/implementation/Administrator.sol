// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

contract Administrator is Ownable, IAdminstrator {
    address target;

    constructor(address _target) {
        require(_target != address(0), "Target address cannot be null");
        target = _target;
    }

    function pause() external override onlyOwner {
        /* TODO: pause */
    }

    function unpause() external override onlyOwner {
        /* TODO: unpause */
    }

    function withdraw() external override onlyOwner {
        /* TODO: withdraw */
    }
}
