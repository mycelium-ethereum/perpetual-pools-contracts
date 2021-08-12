// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "../implementation/PoolSwapLibrary.sol";

contract TestPoolSwapLibrary {
    function getAmountOut(bytes16 ratio, uint112 amountIn) internal pure returns (uint112) {
        return PoolSwapLibrary.getAmountOut(ratio, amountIn);
    }
}
