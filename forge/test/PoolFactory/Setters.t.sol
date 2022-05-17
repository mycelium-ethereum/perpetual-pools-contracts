//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../helpers/PoolSetupHelper.t.sol";

contract PoolFactorySettersTest is PoolSetupHelper {
    function setUp() public {
        setupPoolAndTokenContracts(POOL_CODE, 2, 5, 1, FEE_RECEIVER, DEFAULT_FEE, 0, 0, 0);
    }

    function test_updateFeeAddress_should_set_fee_address() public {
        vm.prank(GOVERNANCE);
        poolFactory.setFeeReceiver(ADDR_3);
    }

    function test_cannot_updateFeeAddress_if_not_gov() public {
        vm.expectRevert("msg.sender not governance");
        poolFactory.setFeeReceiver(ADDR_3);
    }

    function test_setKeeper_should_set_keeper_address() public {
        vm.prank(GOVERNANCE);
        poolFactory.setPoolKeeper(ADDR_3);
    }

    function test_cannot_setKeeper_if_not_gov() public {
        vm.expectRevert("msg.sender not governance");
        poolFactory.setPoolKeeper(ADDR_3);
    }

    function test_transferGovernance_should_set_provisional_gov() public {
        vm.prank(GOVERNANCE);
        poolFactory.transferGovernance(ADDR_3);
    }

    function test_cannot_transferGovernance_if_not_gov() public {
        vm.expectRevert("msg.sender not governance");
        poolFactory.transferGovernance(ADDR_3);
    }

    function test_claimGovernance_should_set_actual_gov() public {
        vm.prank(GOVERNANCE);
        poolFactory.transferGovernance(ADDR_3);
        vm.prank(ADDR_3);
        poolFactory.claimGovernance();
        assertFalse(poolFactory.governanceTransferInProgress());
    }

    function test_cannot_claimGovernance_when_not_in_progress() public {
        vm.prank(ADDR_3);
        vm.expectRevert("No governance change active");
        poolFactory.claimGovernance();
    }

    function test_cannot_claimGovernance_when_not_provisional_gov() public {
        vm.prank(GOVERNANCE);
        poolFactory.transferGovernance(ADDR_3);
        vm.prank(ADDR_4);
        vm.expectRevert("Not provisional governor");
        poolFactory.claimGovernance();
    }
}
