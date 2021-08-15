// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/*
@title The PoolCommitterDeployer interface
*/
interface IPoolCommitterDeployer {
    function deploy() external returns (address);
}
