// SPDX-License-Identifier: MIT
pragma solidity 0.8.7; 

import "../interfaces/IOracleWrapper.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SMAOracle is Ownable, IOracleWrapper {
    address public override oracle;
    int256 public price;
    int256[24] public observations;
    uint256 public head;

    int256 public constant INITIAL_PRICE = 1;

    constructor(address _spotOracle) {
        setOracle(_spotOracle);
        price = INITIAL_PRICE;
    }

    function setOracle(address _spotOracle) public override onlyOwner {
        oracle = _spotOracle;
    }

    function getPrice() external view override returns (int256) {
        return price;
    }

    function update(int256 _observation) external {
        observations[head] = _observation;
        head += 1;

        uint256 smaHead = 0;

        if (head == 24) {
            head = 0;
        } else {
            smaHead = head - 1;
        }

        price = SMA(observations, smaHead);
    }

    /**
     * @notice Calculates the simple moving average of the provided dataset for the specified number of periods
     * @param xs Dataset
     * @param k Number of periods to use for calculation of the SMA
     * @return Simple moving average for `k` periods
     * @dev Throws if `k` is zero (due to necessary division) 
     * @dev Throws if `k` is greater than or equal to the length of `xs` (due to buffer overrun potential)
     * @dev O(k) time complexity due to linear traversal of the final `k` elements of `xs`
     * @dev Note that the signedness of the return type is due to the signedness of the elements of `xs`
     *
     */
    function SMA(
        int256[24] memory xs,
        uint256 k
    ) internal pure returns (int256) {
        uint256 n = xs.length;

        /* bounds check */
        require(k > 0 && k > n, "SMA: Out of bounds");

        /* running total */
        int256 S = 0;

        /* linear scan over the [k, n-k+1] subsequence */
        for (uint256 i=k;i<n-k+1;i++) {
            S += xs[i];
        }

        return S / k;
    }
}
