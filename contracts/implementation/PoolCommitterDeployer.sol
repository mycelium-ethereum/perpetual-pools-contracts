// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "./PoolCommitter.sol";
import "../interfaces/IPoolCommitterDeployer.sol";

/*
@title The deployer of PoolCommitter
*/
contract PoolCommitterDeployer is IPoolCommitterDeployer {
    function deploy(address factory) external override returns (address poolCommitter) {
        poolCommitter = address(new PoolCommitter(factory));
    }
}
