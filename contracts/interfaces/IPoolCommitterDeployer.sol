//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

/// @title The PoolCommitterDeployer interface
interface IPoolCommitterDeployer {
    function deploy(address invariantCheckContract) external returns (address);
}
