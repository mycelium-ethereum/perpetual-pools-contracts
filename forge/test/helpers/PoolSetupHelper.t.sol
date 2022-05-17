//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "forge-std/Test.sol";
import "./Constants.sol";
import "interfaces/IPoolFactory.sol";

import "testutils/TestERC20.sol";
import "testutils/TestChainlinkOracle.sol";
import "implementation/L2Encoder.sol";
import "implementation/ChainlinkOracleWrapper.sol";
import "implementation/PoolFactory.sol";
import "implementation/PoolToken.sol";
import "implementation/InvariantCheck.sol";
import "implementation/PoolKeeper.sol";
import "implementation/KeeperRewards.sol";
import "implementation/AutoClaim.sol";
import "implementation/LeveragedPool.sol";
import "implementation/PoolCommitter.sol";

abstract contract PoolSetupHelper is Constants, Test {
    address constant DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address constant GOVERNANCE = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address constant FEE_RECEIVER = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address constant ADDR_1 = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;
    address constant ADDR_2 = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;
    address constant ADDR_3 = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc;
    address constant ADDR_4 = 0x976EA74026E726554dB657fA54763abd0C3a0aa9;

    L2Encoder l2Encoder;
    TestToken token;
    TestChainlinkOracle chainlinkOracle;
    TestChainlinkOracle ethOracle;
    ChainlinkOracleWrapper oracleWrapper;
    ChainlinkOracleWrapper settlementEthOracle;
    PoolFactory poolFactory;
    InvariantCheck invariantCheck;
    PoolKeeper poolKeeper;
    KeeperRewards keeperRewards;
    AutoClaim autoclaim;

    LeveragedPool leveragedPool;
    PoolToken long;
    PoolToken short;
    PoolCommitter poolCommiter;

    function _deployPoolSetupContracts() private {
        l2Encoder = new L2Encoder();

        // Deploy test ERC20 token
        token = new TestToken("TEST TOKEN", "TST1");
        token.mint(DEPLOYER, DEFAULT_MINT_AMOUNT);

        // Deploy test oracle
        ethOracle = new TestChainlinkOracle();
        ethOracle.setPrice(3000 * 1e8);

        chainlinkOracle = new TestChainlinkOracle();
        oracleWrapper = new ChainlinkOracleWrapper(address(chainlinkOracle), DEPLOYER);

        // keeper oracle
        settlementEthOracle = new ChainlinkOracleWrapper(address(ethOracle), DEPLOYER);

        // Deploy and init pool
        poolFactory = new PoolFactory(FEE_RECEIVER, GOVERNANCE);

        invariantCheck = new InvariantCheck(address(poolFactory));
        poolFactory.setInvariantCheck(address(invariantCheck));

        poolKeeper = new PoolKeeper(address(poolFactory));
        poolFactory.setPoolKeeper(address(poolKeeper));
        poolFactory.setFee(DEFAULT_FEE);

        keeperRewards = new KeeperRewards(address(poolKeeper));
        poolKeeper.setKeeperRewards(address(keeperRewards));

        autoclaim = new AutoClaim(address(poolFactory));
        poolFactory.setAutoClaim(address(autoclaim));
    }

    /**
     * Deploys a new instance of a pool, as well as an ERC20 token to use as a settlement token.
     * @param poolCode The pool identifier
     * @param frontRunningInterval The front running interval value. Must be less than the update interval
     * @param updateInterval The update interval value
     * @param leverage The amount of leverage the pool will apply
     * @param feeAddress The address to transfer fees to on a fund movement
     * @param fee The fund movement fee.
     * @param mintFee Mint fee
     * @param burnFee Burn fee
     * @param changeInterval Change interval
     */
    function setupPoolAndTokenContracts(
        string memory poolCode,
        uint32 frontRunningInterval,
        uint32 updateInterval,
        uint16 leverage,
        address feeAddress,
        uint256 fee,
        uint256 mintFee,
        uint256 burnFee,
        uint256 changeInterval
    ) internal {
        skip(100000); // start block.timestamp @ 100000
        vm.startPrank(GOVERNANCE);
        _deployPoolSetupContracts();

        if (fee > 0) {
            poolFactory.setFee(fee);
        }

        if (feeAddress != address(0)) {
            poolFactory.setFeeReceiver(feeAddress);
        }

        vm.stopPrank();

        // deploy leveraged pool
        IPoolFactory.PoolDeployment memory deploymentParameters = IPoolFactory.PoolDeployment({
            poolName: poolCode,
            frontRunningInterval: frontRunningInterval,
            updateInterval: updateInterval,
            leverageAmount: leverage,
            settlementToken: address(token),
            oracleWrapper: address(oracleWrapper),
            settlementEthOracle: address(settlementEthOracle),
            feeController: DEPLOYER,
            mintingFee: mintFee,
            burningFee: burnFee,
            changeInterval: changeInterval
        });

        vm.prank(DEPLOYER);
        leveragedPool = LeveragedPool(poolFactory.deployPool(deploymentParameters));

        // fast forward in seconds
        skip(updateInterval * 10_000);

        poolKeeper.performUpkeepSinglePool(address(leveragedPool));
        long = PoolToken(leveragedPool.tokens(0));
        short = PoolToken(leveragedPool.tokens(1));
        poolCommiter = PoolCommitter(leveragedPool.poolCommitter());
    }
}
