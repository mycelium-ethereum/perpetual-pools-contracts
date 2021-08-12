// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "../implementation/PoolSwapLibrary.sol";

contract TestPoolSwapLibrary {
    function getAmountOut(bytes16 ratio, uint112 amountIn) external pure returns (uint112) {
        return PoolSwapLibrary.getAmountOut(ratio, amountIn);
    }

    function getRatio(uint112 _numerator, uint112 _denominator) external pure returns (bytes16) {
        return PoolSwapLibrary.getRatio(_numerator, _denominator);
    }
}
