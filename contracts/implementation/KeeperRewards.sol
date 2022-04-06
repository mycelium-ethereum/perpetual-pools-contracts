//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IKeeperRewards.sol";
import "../interfaces/IOracleWrapper.sol";
import "../interfaces/IERC20DecimalsWrapper.sol";

import "../libraries/PoolSwapLibrary.sol";

/// @title The contract for calculating and executing keeper reward payments
contract KeeperRewards is IKeeperRewards {
    address public immutable keeper;
    /* Constants */
    uint256 public constant BASE_TIP = 5; // 5% base tip
    uint256 public constant TIP_DELTA_PER_BLOCK = 5; // 5% increase per block
    uint256 public constant BLOCK_TIME = 13; /* in seconds */
    uint256 public constant MAX_TIP = 100; /* maximum keeper tip */
    bytes16 public constant FIXED_POINT = 0x403abc16d674ec800000000000000000; // 1 ether

    /// Captures fixed gas overhead for performing upkeep that's unreachable
    /// by `gasleft()` due to our approach to error handling in that code
    uint256 public constant FIXED_GAS_OVERHEAD = 80195;

    constructor(address _keeper) {
        require(_keeper != address(0), "PoolKeeper cannot be 0 address");
        keeper = _keeper;
    }

    modifier onlyKeeper() {
        require(msg.sender == keeper, "msg.sender not keeper");
        _;
    }

    /**
     * @notice Pay keeper for upkeep
     * @param _keeper Address of the EOA upkeeping the pool. This is required since the function is called externally
     * @param _pool Address of the given pool
     * @param _gasPrice Price of a single gas unit (in ETH (wei))
     * @param _gasSpent Number of gas units spent
     * @param _savedPreviousUpdatedTimestamp Last timestamp when the pool's price execution happened
     * @param _updateInterval Pool interval of the given pool
     */
    function payKeeper(
        address _keeper,
        address _pool,
        uint256 _gasPrice,
        uint256 _gasSpent,
        uint256 _savedPreviousUpdatedTimestamp,
        uint256 _updateInterval
    ) external override onlyKeeper returns (uint256) {
        try IOracleWrapper(ILeveragedPool(_pool).settlementEthOracle()).poll() {} catch Error(string memory reason) {
            emit PoolUpkeepError(_pool, reason);
        }
        int256 settlementTokenPrice = IOracleWrapper(ILeveragedPool(_pool).settlementEthOracle()).getPrice();

        uint256 reward = keeperReward(
            _pool,
            _gasPrice,
            _gasSpent,
            _savedPreviousUpdatedTimestamp,
            _updateInterval,
            uint256(settlementTokenPrice)
        );
        if (ILeveragedPool(_pool).payKeeperFromBalances(_keeper, reward)) {
            return reward;
        } else {
            return 0;
        }
    }

    /**
     * @notice Payment keeper receives for performing upkeep on a given pool
     * @param _gasPrice Price of a single gas unit (in ETH (wei))
     * @param _gasSpent Number of gas units spent
     * @param _savedPreviousUpdatedTimestamp Last timestamp when the pool's price execution happened
     * @param _poolInterval Pool interval of the given pool
     * @return Number of settlement tokens to give to the keeper for work performed
     */
    function keeperReward(
        address _pool,
        uint256 _gasPrice,
        uint256 _gasSpent,
        uint256 _savedPreviousUpdatedTimestamp,
        uint256 _poolInterval,
        uint256 _settlementTokenPrice
    ) public view returns (uint256) {
        /**
         * Conceptually, we have
         *
         * Reward = Gas + Tip = Gas + (Base + Premium * Blocks)
         *
         * Very roughly to scale:
         *
         * +---------------------------+------+---+---+~~~~~
         * | GGGGGGGGGGGGGGGGGGGGGGGGG | BBBB | P | P | ...
         * +---------------------------+------+---+---+~~~~~
         *
         * Under normal circumstances, we don't expect there to be any time
         * premium at all. The time premium exists in order to *further*
         * incentivise upkeep in the event of lateness.
         *
         * The base tip exists to act as pure profit for a keeper.
         *
         * Of course, the gas component acts as compensation for performing
         * on-chain computation.
         *
         */

        // keeper gas cost in wei. WAD formatted
        uint256 _keeperGas = keeperGas(_gasPrice, _gasSpent, _settlementTokenPrice);

        // tip percent
        uint256 _tipPercent = keeperTip(_savedPreviousUpdatedTimestamp, _poolInterval);

        // amount of settlement tokens to give to the keeper
        // _keeperGas + _keeperGas * percentTip
        uint256 wadRewardValue = _keeperGas + ((_keeperGas * _tipPercent) / 100);
        uint256 decimals = IERC20DecimalsWrapper(ILeveragedPool(_pool).settlementToken()).decimals();
        return PoolSwapLibrary.fromWad(uint256(wadRewardValue), decimals);
    }

    /**
     * @notice Compensation a keeper will receive for their gas expenditure
     * @param _gasPrice Price of a single gas unit (in ETH (wei))
     * @param _gasSpent Number of gas units spent
     * @return Keeper's gas compensation
     * @dev Adds a constant to `_gasSpent` when calculating actual gas usage
     */
    function keeperGas(
        uint256 _gasPrice,
        uint256 _gasSpent,
        uint256 _settlementTokenPrice
    ) public pure returns (uint256) {
        if (_settlementTokenPrice == 0) {
            return 0;
        } else {
            /* gas spent plus our fixed gas overhead */
            uint256 gasUsed = _gasSpent + FIXED_GAS_OVERHEAD;

            /* safe due to explicit bounds check for settlementTokenPrice above */
            /* (wei * Settlement / ETH) / fixed point (10^18) = amount in settlement */
            bytes16 weiSpent = ABDKMathQuad.fromUInt(_gasPrice * gasUsed);
            bytes16 settlementTokenPrice = ABDKMathQuad.fromUInt(uint256(_settlementTokenPrice));
            return ABDKMathQuad.toUInt(ABDKMathQuad.div(ABDKMathQuad.mul(weiSpent, settlementTokenPrice), FIXED_POINT));
        }
    }

    /**
     * @notice Tip a keeper will receive for successfully updating the specified pool
     * @param _savedPreviousUpdatedTimestamp Last timestamp when the pool's price execution happened
     * @param _poolInterval Pool interval of the given pool
     * @return Percent of the `keeperGas` cost to add to payment, as a percent
     */
    function keeperTip(uint256 _savedPreviousUpdatedTimestamp, uint256 _poolInterval) public view returns (uint256) {
        /* the number of blocks that have elapsed since the given pool's updateInterval passed */
        uint256 elapsedBlocksNumerator = (block.timestamp - (_savedPreviousUpdatedTimestamp + _poolInterval));

        uint256 keeperTipAmount = BASE_TIP + (TIP_DELTA_PER_BLOCK * elapsedBlocksNumerator) / BLOCK_TIME;

        // In case of network outages or otherwise, we want to cap the tip so that the keeper cost isn't unbounded
        if (keeperTipAmount > MAX_TIP) {
            return MAX_TIP;
        } else {
            return keeperTipAmount;
        }
    }
}
