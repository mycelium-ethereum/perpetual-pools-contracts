// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "./PoolCommitter.sol";
import "../interfaces/IPoolCommitterDeployer.sol";

/*
@title The deployer of PriceChanger and PoolCommitter
*/
contract PoolCommitterDeployer is IPoolCommitterDeployer {
    function deploy(address factory) external override returns (address poolCommitter) {
        poolCommitter = address(new PoolCommitter(factory));
    }
}
