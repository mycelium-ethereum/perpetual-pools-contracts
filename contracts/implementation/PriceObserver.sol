//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../interfaces/IPriceObserver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PriceObserver is Ownable, IPriceObserver {
    uint256 public constant maxNumElems = 24;
    uint256 public numElems = 0;
    int256[maxNumElems] public observations;

    function capacity() public view override returns (uint256) {
        return maxNumElems;
    }

    function length() public view override returns (uint256) {
        return numElems;
    }

    function get(uint256 i) public view override returns (int256) {
        require(i < length(), "PO: Out of bounds");
        return observations[i];
    }

    function getAll() public view override returns (int256[24] memory) {
        return observations;
    }

    function add(int256 x) public override returns (bool) {
        if (full()) {
            observations[capacity() - 1] = x;
            return true;
        } else {
            observations[length()] = x;
            numElems += 1;
            return false;
        }
    }

    function full() private view returns (bool) {
        return length() == capacity();
    }

    function clear() public onlyOwner {
        numElems = 0;
        delete observations;
    }
}
