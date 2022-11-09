//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "interfaces/IPoolCommitter.sol";

abstract contract Constants {
    uint256 constant DEFAULT_MINT_AMOUNT = 100_000_000 ether;
    uint256 constant DEFAULT_FEE = 0;

    string constant MARKET_CODE = "TEST/MARKET";
    string constant POOL_CODE = "CODE1";
    string constant POOL_CODE_2 = "CODE2";
}
