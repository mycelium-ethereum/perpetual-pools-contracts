//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IPoolFactory.sol";
import "../interfaces/ILeveragedPool.sol";

/**
 * @title FeeClaimooooor is a utility contract for claiming primary and/or secondary fees for all Perpetual Pools markets as easily as possible, and atomically.
 * @author CalabashSquash
 */
contract FeeClaimooooor {
    IPoolFactory immutable factory;

    /**
     * @param _factory The address of the main `PoolFactory` contract.
     */
    constructor(address _factory) {
        factory = IPoolFactory(_factory);
    }

    /**
     * @notice Increment a number without checking for overflow.
     * @param i A number to increment.
     */
    function inc(uint256 i) private pure returns (uint256) {
        unchecked {
            return ++i;
        }
    }

    /**
     * @notice Claims both primary and secondary fees from a given market.
     * @param pool the `LeveragedPool` to claim fees from.
     */
    function _claimBoth(ILeveragedPool pool) private {
        pool.claimSecondaryFees();
        pool.claimPrimaryFees();
    }

    /**
     * @notice Iterates through all pools deployed by `factory`, and claims all primary fees.
     * @dev May run out of gas if too many pools are deployed.
     */
    function claimAllPrimary() external {
        uint256 numPools = factory.numPools();
        ILeveragedPool pool;
        for (uint256 i = 0; i < numPools; i = inc(i)) {
            pool = ILeveragedPool(factory.pools(i));
            pool.claimPrimaryFees();
        }
    }

    /**
     * @notice Iterates through all pools deployed by `factory`, and claims all secondary fees.
     * @dev May run out of gas if too many markets are deployed.
     */
    function claimAllSecondary() external {
        uint256 numPools = factory.numPools();
        ILeveragedPool pool;
        for (uint256 i = 0; i < numPools; i = inc(i)) {
            pool = ILeveragedPool(factory.pools(i));
            pool.claimSecondaryFees();
        }
    }

    /**
     * @notice Iterates through all pools deployed by `factory`, and claims all primary and secondary fees.
     * @dev May run out of gas if too many markets are deployed.
     */
    function claimAll() external {
        uint256 numPools = factory.numPools();
        ILeveragedPool pool;
        for (uint256 i = 0; i < numPools; i = inc(i)) {
            pool = ILeveragedPool(factory.pools(i));
            _claimBoth(pool);
        }
    }

    /**
     * @notice Iterates through all pools deployed by `factory`, and claims all primary fees.
     * @param pools A list of `LeveragedPool` addresses to claim fees for.
     * @dev May run out of gas if too many markets are deployed.
     * @dev There is no check to `PoolFactory.isValidPool` for each pool.
     */
    function claimList(address[] calldata pools) external {
        ILeveragedPool pool;
        // `i < pools.length` is cheaper than caching in memory because `pools` is `calldata`.
        for (uint256 i = 0; i < pools.length; i = inc(i)) {
            pool = ILeveragedPool(pools[i]);
            _claimBoth(pool);
        }
    }
}
