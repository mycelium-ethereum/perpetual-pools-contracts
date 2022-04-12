//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

interface IResolver {
    function checker() external view returns (bool canExec, bytes memory execPayLoad);
}
