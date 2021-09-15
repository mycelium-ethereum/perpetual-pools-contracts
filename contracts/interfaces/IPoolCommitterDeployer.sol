// SPDX-License-Identifier: CC-BY-NC-ND-3.0
pragma solidity 0.8.7;

/// @title The PoolCommitterDeployer interface
interface IPoolCommitterDeployer {
    function deploy(uint128 _minimumCommitSize, uint128 _maximumCommitQueueLength) external returns (address);
}
