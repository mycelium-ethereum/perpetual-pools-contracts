// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolFactory.sol";
import "./LeveragedPool.sol";
import "./PoolToken.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "hardhat/console.sol";

/*
@title The oracle management contract
*/
contract PoolFactory is IPoolFactory {
  // #### Globals
  PoolToken public pairTokenBase;
  LeveragedPool public poolBase;

  // #### Functions
  constructor() {
    // Deploy base contracts
    pairTokenBase = new PoolToken();
    poolBase = new LeveragedPool();

    // Init bases
    poolBase.initialize(
      address(this),
      address(0),
      address(0),
      "BASE_POOL",
      2,
      0,
      0,
      address(this),
      address(this)
    );

    pairTokenBase.initialize(address(this), "BASE_TOKEN", "BASE");
  }

  function deployPool(
    address _owner,
    string memory _poolCode,
    uint32 _frontRunningInterval,
    bytes16 _fee,
    uint16 _leverageAmount,
    address _feeAddress,
    address _quoteToken
  ) external override returns (address) {
    LeveragedPool pool =
      LeveragedPool(
        Clones.cloneDeterministic(
          address(poolBase),
          keccak256(abi.encode(_poolCode))
        )
      );
    emit DeployPool(address(pool), _poolCode);
    pool.initialize(
      _owner,
      deployPairToken(
        address(pool),
        string(abi.encodePacked(_poolCode, "-LONG")),
        string(abi.encodePacked("L-", _poolCode))
      ),
      deployPairToken(
        address(pool),
        string(abi.encodePacked(_poolCode, "-SHORT")),
        string(abi.encodePacked("S-", _poolCode))
      ),
      _poolCode,
      _frontRunningInterval,
      _fee,
      _leverageAmount,
      _feeAddress,
      _quoteToken
    );
    return address(pool);
  }

  function deployPairToken(
    address owner,
    string memory name,
    string memory symbol
  ) internal returns (address) {
    PoolToken pairToken =
      PoolToken(
        Clones.cloneDeterministic(
          address(pairTokenBase),
          keccak256(abi.encode(name))
        )
      );
    pairToken.initialize(owner, name, symbol);
    return address(pairToken);
  }
}
