// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/*
@title The pool controller contract interface
*/
interface IPriceChangerDeployer {
    function deploy(address _feeAddress) external returns (address priceChanger);
}
