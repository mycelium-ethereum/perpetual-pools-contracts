// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/// @title The PoolCommitterDeployer interface
interface IPoolCommitterDeployer {
    function deploy(uint128 _minimumCommitSize, uint128 _maximumCommitQueueLength) external returns (address);
}
