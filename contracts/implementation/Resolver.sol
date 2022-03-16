//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

interface IPoolKeeper {
    function isUpkeepRequiredSinglePool(address pool) external view returns (bool);
}

contract Resolver {
    bool[] boolArray;
    address public immutable keeper = 0x759E817F0C40B11C775d1071d466B5ff5c6ce28e;

    constructor() {}

    function checker(address _pools) public view returns (bool canBeUpKept, bytes memory execPayLoad) {
        canBeUpKept = IPoolKeeper(keeper).isUpkeepRequiredSinglePool(_pools);
        // uint256 poolsLength = _pools.length;
        // for (uint256 i = 0; i < poolsLength; i++) {
        //         boolArray.push(IPoolKeeper(keeper).isUpkeepRequiredSinglePool(_pools[i]));
        // }
        execPayLoad = abi.encodeWithSelector(IPoolKeeper(keeper).isUpkeepRequiredSinglePool.selector, address(_pools));
    }
}
