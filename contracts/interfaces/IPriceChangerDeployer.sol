// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/*
@title The pool controller contract interface
*/
interface IPriceChangerDeployer {
    function deploy(address _feeAddress, address _factory) external returns (address priceChanger);
}
