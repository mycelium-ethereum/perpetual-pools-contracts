//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IResolver.sol";
import "../interfaces/IPoolFactory.sol";
import "../interfaces/IPoolKeeper.sol";

/// @title The resolver contract is responsible for periodically checking if a pool requires to be upkept
/// @notice This contract will be used in gelato app to create a gelato task for upkeeping pools.
contract Resolver is IResolver {
    IPoolFactory public poolFactory;
    IPoolKeeper public poolKeeper;

    constructor(address _poolFactory) {
        poolFactory = IPoolFactory(_poolFactory);
        poolKeeper = IPoolKeeper(poolFactory.getPoolKeeper());
    }

    /**
     * @notice Iterate through all pools and will then return true if can be upkept, and data including the function selector and parameters.
     * @return execPayLoad payload data of the `isUpkeepRequiredSinglePool` function selector with the pool address as argument
     */
    function upKeepChecker() external view override returns (bytes[] memory execPayLoad) {
        uint256 poolsLength = poolFactory.numPools();
        execPayLoad = new bytes[](poolsLength);
        for (uint256 i = 0; i < poolsLength; ) {
            address pool = poolFactory.pools(i);
            if (poolKeeper.isUpkeepRequiredSinglePool(pool)) {
                execPayLoad[i] = abi.encodeWithSelector(poolKeeper.isUpkeepRequiredSinglePool.selector, address(pool));
            }
            unchecked {
                ++i;
            }
        }
        return execPayLoad;
    }
}
