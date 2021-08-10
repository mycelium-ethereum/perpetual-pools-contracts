// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/*
@title The pool controller contract interface
*/
interface IPoolCommittorDeployer {
    function deploy(address _quoteToken) external returns (address poolCommittor);
}
