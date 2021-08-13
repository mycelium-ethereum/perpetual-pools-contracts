// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;
pragma abicoder v2;
import "../implementation/PoolSwapLibrary.sol";

library PoolSwapLibraryMock {
    function convertDecimalToUInt(bytes16 ratio) external pure returns (uint256) {
        return PoolSwapLibrary.convertDecimalToUInt(ratio);
    }

    function multiplyDecimalByUInt(bytes16 a, uint256 b) external pure returns (bytes16) {
        return PoolSwapLibrary.multiplyDecimalByUInt(a, b);
    }
}
