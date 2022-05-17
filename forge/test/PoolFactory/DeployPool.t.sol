//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../helpers/PoolSetupHelper.t.sol";
import "interfaces/ILeveragedPool.sol";
import "testutils/TestClones.sol";
import "implementation/SMAOracle.sol";

contract PoolFactoryDeployPoolTest is PoolSetupHelper {
    address constant NON_DAO = ADDR_4;

    uint32 internal frontRunningInterval = 20;
    uint32 internal updateInterval = 100;
    uint256 internal fee = 0.1 ether;
    uint16 internal leverage = 1;

    function setUp() public {
        setupPoolAndTokenContracts(
            POOL_CODE,
            frontRunningInterval,
            updateInterval,
            leverage,
            FEE_RECEIVER,
            fee,
            0,
            0,
            0
        );
    }

    function test_cannot_deploy_when_not_called_by_oracleWrapper_owner_and_with_valid_params() public {
        IPoolFactory.PoolDeployment memory deploymentParameters = IPoolFactory.PoolDeployment({
            poolName: POOL_CODE,
            frontRunningInterval: 5,
            updateInterval: 10,
            leverageAmount: 5,
            settlementToken: address(token),
            oracleWrapper: address(oracleWrapper),
            settlementEthOracle: address(settlementEthOracle),
            feeController: DEPLOYER,
            mintingFee: 0,
            burningFee: 0,
            changeInterval: 0
        });

        vm.startPrank(NON_DAO);
        vm.expectRevert("Deployer must be oracle wrapper owner");
        poolFactory.deployPool(deploymentParameters);
        vm.stopPrank();
    }

    function test_deploy_minimal_clone_when_called_by_DAO_with_valid_params() public {
        assertEq(leveragedPool.poolName(), "1-CODE1");
    }

    function test_cannot_init_when_called_twice() public {
        ILeveragedPool.Initialization memory initialization = ILeveragedPool.Initialization({
            _owner: ADDR_1,
            _keeper: ADDR_1,
            _oracleWrapper: ADDR_1,
            _settlementEthOracle: ADDR_1,
            _longToken: ADDR_1,
            _shortToken: ADDR_1,
            _poolCommitter: ADDR_1,
            _poolName: POOL_CODE,
            _frontRunningInterval: 3,
            _updateInterval: 5,
            _invariantCheck: ADDR_1,
            _leverageAmount: 5,
            _feeAddress: FEE_RECEIVER,
            _secondaryFeeAddress: address(0),
            _settlementToken: address(token),
            _secondaryFeeSplitPercent: 10,
            _fee: 5
        });

        vm.expectRevert("Initializable: contract is already initialized");
        leveragedPool.initialize(initialization);
    }

    function test_cannot_have_multiple_clones_with_same_leverageAmount_settlementToken_and_oracleWrapper() public {
        IPoolFactory.PoolDeployment memory deploymentParameters = IPoolFactory.PoolDeployment({
            poolName: POOL_CODE_2,
            frontRunningInterval: 3,
            updateInterval: 5,
            leverageAmount: 5,
            settlementToken: address(token),
            oracleWrapper: address(oracleWrapper),
            settlementEthOracle: address(settlementEthOracle),
            feeController: DEPLOYER,
            mintingFee: 0,
            burningFee: 0,
            changeInterval: 0
        });

        vm.startPrank(DEPLOYER);
        poolFactory.deployPool(deploymentParameters);

        deploymentParameters.updateInterval = 60;
        deploymentParameters.frontRunningInterval = 30;
        vm.expectRevert("ERC1167: create2 failed");
        poolFactory.deployPool(deploymentParameters);
        vm.stopPrank();
    }

    function test_pool_should_own_tokens() public {
        assertEq(long.owner(), address(leveragedPool));
        assertEq(short.owner(), address(leveragedPool));
    }

    function test_should_use_default_keeper() public {
        IPoolFactory.PoolDeployment memory deploymentParameters = IPoolFactory.PoolDeployment({
            poolName: POOL_CODE_2,
            frontRunningInterval: 2,
            updateInterval: 5,
            leverageAmount: 3,
            settlementToken: address(token),
            oracleWrapper: address(oracleWrapper),
            settlementEthOracle: address(settlementEthOracle),
            feeController: DEPLOYER,
            mintingFee: 0,
            burningFee: 0,
            changeInterval: 0
        });

        vm.prank(DEPLOYER);
        LeveragedPool pool2 = LeveragedPool(poolFactory.deployPool(deploymentParameters));
        assertEq(pool2.keeper(), address(poolKeeper));
    }

    function test_cannot_deploy_if_leverage_lessThan_1() public {
        IPoolFactory.PoolDeployment memory deploymentParameters = IPoolFactory.PoolDeployment({
            poolName: POOL_CODE_2,
            frontRunningInterval: 2,
            updateInterval: 5,
            leverageAmount: 0,
            settlementToken: address(token),
            oracleWrapper: address(oracleWrapper),
            settlementEthOracle: address(settlementEthOracle),
            feeController: DEPLOYER,
            mintingFee: 0,
            burningFee: 0,
            changeInterval: 0
        });

        vm.startPrank(DEPLOYER);
        vm.expectRevert("Leveraged amount cannot equal 0");
        poolFactory.deployPool(deploymentParameters);
        vm.stopPrank();
    }

    function test_cannot_deploy_if_token_moreThan_18_decimals() public {
        TestToken test = new TestToken("TEST", "TST1");
        test.setDecimals(19);

        IPoolFactory.PoolDeployment memory deploymentParameters = IPoolFactory.PoolDeployment({
            poolName: POOL_CODE_2,
            frontRunningInterval: 2,
            updateInterval: 5,
            leverageAmount: 1,
            settlementToken: address(test),
            oracleWrapper: address(oracleWrapper),
            settlementEthOracle: address(settlementEthOracle),
            feeController: DEPLOYER,
            mintingFee: 0,
            burningFee: 0,
            changeInterval: 0
        });

        vm.startPrank(DEPLOYER);
        vm.expectRevert("Decimal precision too high");
        poolFactory.deployPool(deploymentParameters);
        vm.stopPrank();
    }

    function test_clone_deploys_deterministically() public {
        TestClones cloneLib = new TestClones();

        bytes32 salt = keccak256(
            abi.encode(frontRunningInterval, updateInterval, leverage, address(token), address(oracleWrapper))
        );

        address predicted = cloneLib.predictDeterministicAddress(
            poolFactory.poolBaseAddress(),
            salt,
            address(poolFactory)
        );
        assertEq(predicted, address(leveragedPool));
    }

    function testFail_clone_addresses_equal_if_leverage_is_different() public {
        TestClones cloneLib = new TestClones();

        bytes32 salt = keccak256(
            abi.encode(frontRunningInterval, updateInterval, 2, address(token), address(oracleWrapper))
        );

        address predicted = cloneLib.predictDeterministicAddress(
            poolFactory.poolBaseAddress(),
            salt,
            address(poolFactory)
        );
        assertEq(predicted, address(leveragedPool));
    }

    function test_secondaryFee_split_works_on_factory() public {
        uint256 percent = 20;

        vm.prank(GOVERNANCE);
        poolFactory.setSecondaryFeeSplitPercent(percent);
        assertEq(poolFactory.secondaryFeeSplitPercent(), percent);
    }

    function test_secondaryFee_eq_20_on_deployed_pool() public {
        vm.prank(GOVERNANCE);
        poolFactory.setSecondaryFeeSplitPercent(20);

        IPoolFactory.PoolDeployment memory deploymentParameters = IPoolFactory.PoolDeployment({
            poolName: POOL_CODE_2,
            frontRunningInterval: 3,
            updateInterval: 5,
            leverageAmount: 4,
            settlementToken: address(token),
            oracleWrapper: address(oracleWrapper),
            settlementEthOracle: address(settlementEthOracle),
            feeController: DEPLOYER,
            mintingFee: 0,
            burningFee: 0,
            changeInterval: 0
        });

        vm.prank(DEPLOYER);
        LeveragedPool pool2 = LeveragedPool(poolFactory.deployPool(deploymentParameters));

        assertEq(leveragedPool.secondaryFeeSplitPercent(), 10);
        assertEq(pool2.secondaryFeeSplitPercent(), 20);
    }

    function test_pool_fee_transfers_new_fee_split_percentage() public {
        vm.prank(GOVERNANCE);
        poolFactory.setSecondaryFeeSplitPercent(20);

        IPoolFactory.PoolDeployment memory deploymentParameters = IPoolFactory.PoolDeployment({
            poolName: POOL_CODE_2,
            frontRunningInterval: 3,
            updateInterval: 5,
            leverageAmount: 2,
            settlementToken: address(token),
            oracleWrapper: address(oracleWrapper),
            settlementEthOracle: address(settlementEthOracle),
            feeController: DEPLOYER,
            mintingFee: 0,
            burningFee: 0,
            changeInterval: 0
        });

        vm.startPrank(DEPLOYER);
        LeveragedPool pool2 = LeveragedPool(poolFactory.deployPool(deploymentParameters));

        PoolCommitter committer = PoolCommitter(pool2.poolCommitter());
        token.approve(address(pool2), 10_000 ether);

        committer.commit(l2Encoder.encodeCommitParams(2_000 ether, IPoolCommitter.CommitType.LongMint, false, false));

        committer.commit(l2Encoder.encodeCommitParams(2_000 ether, IPoolCommitter.CommitType.ShortMint, false, false));
        vm.stopPrank();

        vm.prank(GOVERNANCE);
        pool2.setKeeper(DEPLOYER);
        vm.prank(pool2.secondaryFeeAddress());
        pool2.updateSecondaryFeeAddress(ADDR_4);
        vm.startPrank(DEPLOYER);

        // Execute commits no price change
        skip(updateInterval);

        int256 lastPrice = 0.0000012345 ether;
        pool2.poolUpkeep(lastPrice, lastPrice);

        // Upkeep pool with price change
        skip(updateInterval);
        pool2.poolUpkeep(lastPrice, lastPrice * 2);

        pool2.claimPrimaryFees();
        pool2.claimSecondaryFees();

        assertEq(token.balanceOf(FEE_RECEIVER) / token.balanceOf(ADDR_4), 4);
    }

    function test_secondaryFee_split_can_eq_100() public {
        vm.prank(GOVERNANCE);
        poolFactory.setSecondaryFeeSplitPercent(100);
    }

    function test_cannot_secondaryFee_MoreThan_100() public {
        vm.startPrank(GOVERNANCE);
        vm.expectRevert("Secondary fee split cannot exceed 100%");
        poolFactory.setSecondaryFeeSplitPercent(200);
        vm.stopPrank();
    }

    function test_use_SMAOracle() public {
        SMAOracle smaOracle = new SMAOracle(address(oracleWrapper), 5, 1, DEPLOYER, DEPLOYER, DEPLOYER);

        vm.startPrank(DEPLOYER);
        for (uint256 i = 0; i < 24; i++) {
            smaOracle.poll();
            skip(1);
        }

        smaOracle.setPoolKeeper(address(poolKeeper));

        IPoolFactory.PoolDeployment memory deploymentParameters = IPoolFactory.PoolDeployment({
            poolName: POOL_CODE_2,
            frontRunningInterval: 5,
            updateInterval: 10,
            leverageAmount: 5,
            settlementToken: address(token),
            oracleWrapper: address(oracleWrapper),
            settlementEthOracle: address(settlementEthOracle),
            feeController: DEPLOYER,
            mintingFee: 0,
            burningFee: 0,
            changeInterval: 0
        });

        poolFactory.deployPool(deploymentParameters);
        vm.stopPrank();
    }
}
