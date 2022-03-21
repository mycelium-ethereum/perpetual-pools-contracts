//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

interface IPoolKeeper {
    function checkUpkeepSinglePool(address pool) external view returns (bool);
}

contract Resolver {
    address public immutable PoolKeeper = 0x759E817F0C40B11C775d1071d466B5ff5c6ce28e;

    function checkerUpKeep(address[] memory _pools) public view returns (bytes[] memory execPayLoad) {
        uint256 poolsLength = _pools.length;
        execPayLoad = new bytes[](poolsLength);
        for (uint256 i = 0; i < poolsLength; i++) {
            if (IPoolKeeper(PoolKeeper).checkUpkeepSinglePool(_pools[i])) {
                execPayLoad[i] = abi.encodeWithSelector(
                    IPoolKeeper(PoolKeeper).checkUpkeepSinglePool.selector,
                    address(_pools[i])
                );
            }
        }
        return execPayLoad;
    }
}
