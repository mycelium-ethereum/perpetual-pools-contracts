// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "./PoolCommitter.sol";
import "../interfaces/IPoolCommitterDeployer.sol";

/*
@title The deployer of the PoolCommitter contract
*/
contract PoolCommitterDeployer is IPoolCommitterDeployer {
    address public factory;

    constructor(address _factory) {
        factory = _factory;
    }

    function deploy() external override onlyFactory returns (address) {
        poolCommitter = address(new PoolCommitter(factory));
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "msg.sender not factory");
        _;
    }
}
