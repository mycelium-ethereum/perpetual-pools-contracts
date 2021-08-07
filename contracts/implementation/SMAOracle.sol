// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IOracleWrapper.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.7/interfaces/AggregatorV2V3Interface.sol";

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

    function SMA(int256[24] memory xs, uint256 n) internal view returns (int256) {
        /* TODO: implement */
    }
}
