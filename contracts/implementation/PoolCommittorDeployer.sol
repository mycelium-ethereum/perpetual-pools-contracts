// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "./PoolCommittor.sol";
import "../interfaces/IPoolCommittorDeployer.sol";
/*
@title The deployer of PriceChanger and PoolCommittor
*/
contract PoolCommittorDeployer is IPoolCommittorDeployer {
	function deploy(address quoteToken) external override returns (address poolCommittor) {
		poolCommittor = address(new PoolCommittor(quoteToken));
	}
}