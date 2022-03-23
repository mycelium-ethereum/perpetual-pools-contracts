//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

interface IResolver {
    function upKeepChecker() external view returns (bytes[] memory execPayLoad);
}
