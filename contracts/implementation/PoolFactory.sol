// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IPoolFactory.sol";
import "./LeveragedPool.sol";
import "./PoolToken.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

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
      address(0),
      address(this),
      address(0),
      address(0),
      "BASE_POOL",
      2,
      2,
      0,
      0,
      address(this),
      address(this)
    );

    pairTokenBase.initialize(address(this), "BASE_TOKEN", "BASE");
  }

  function deployPool(
    PoolDeployment memory deploymentParameters
  ) external override returns (address) {
    LeveragedPool pool =
      LeveragedPool(
        Clones.cloneDeterministic(
          address(poolBase),
          keccak256(abi.encode(deploymentParameters.poolCode))
        )
      );
    emit DeployPool(address(pool), deploymentParameters.poolCode);
    pool.initialize(
      deploymentParameters.owner,
      deploymentParameters.oracleWrapper,
      deployPairToken(
        address(pool),
        string(abi.encodePacked(deploymentParameters.poolCode, "-LONG")),
        string(abi.encodePacked("L-", deploymentParameters.poolCode))
      ),
      deployPairToken(
        address(pool),
        string(abi.encodePacked(deploymentParameters.poolCode, "-SHORT")),
        string(abi.encodePacked("S-", deploymentParameters.poolCode))
      ),
      deploymentParameters.poolCode,
      deploymentParameters.frontRunningInterval,
      deploymentParameters.updateInterval,
      deploymentParameters.fee,
      deploymentParameters.leverageAmount,
      deploymentParameters.feeAddress,
      deploymentParameters.quoteToken
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
