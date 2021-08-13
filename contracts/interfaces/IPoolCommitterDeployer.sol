// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/*
@title The pool controller contract interface
*/
interface IPoolCommitterDeployer {
    function deploy(address _quoteToken) external returns (address poolCommitter);
}
