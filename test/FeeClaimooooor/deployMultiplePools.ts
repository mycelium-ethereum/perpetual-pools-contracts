import { ethers } from "hardhat"
import {
    TestToken__factory,
    L2Encoder__factory,
    TestChainlinkOracle__factory,
    ChainlinkOracleWrapper__factory,
    PoolSwapLibrary__factory,
    PoolFactory__factory,
    PoolKeeper__factory,
    KeeperRewards__factory,
    InvariantCheck__factory,
    AutoClaim__factory,
} from "../../types"
import { POOL_CODE, POOL_CODE_2 } from "../constants"
import { generateRandomAddress } from "../utilities"

/**
 * Deploy multiple pools
 */
export async function deployMultiplePools() {
    const signers = await ethers.getSigners()
    const amount = ethers.utils.parseEther("3000000")
    // Deploy settlement token
    const testToken = (await ethers.getContractFactory(
        "TestToken",
        signers[0]
    )) as TestToken__factory
    const token = await testToken.deploy("TEST TOKEN", "TST1")
    await token.deployed()
    await token.mint(signers[0].address, amount)
    const settlementToken = token.address

    const l2EncoderFactory = (await ethers.getContractFactory(
        "L2Encoder",
        signers[0]
    )) as L2Encoder__factory
    const l2Encoder = await l2EncoderFactory.deploy()
    await l2Encoder.deployed()

    // Deploy oracle. Using a test oracle for predictability
    const oracleFactory = (await ethers.getContractFactory(
        "TestChainlinkOracle",
        signers[0]
    )) as TestChainlinkOracle__factory
    const oracle = await oracleFactory.deploy()
    await oracle.deployed()
    const oracleWrapperFactory = (await ethers.getContractFactory(
        "ChainlinkOracleWrapper",
        signers[0]
    )) as ChainlinkOracleWrapper__factory
    const oracleWrapper = await oracleWrapperFactory.deploy(
        oracle.address,
        signers[0].address
    )
    await oracleWrapper.deployed()

    const settlementEthOracle = await oracleWrapperFactory.deploy(
        oracle.address,
        signers[0].address
    )
    await settlementEthOracle.deployed()

    // Deploy pool keeper
    const libraryFactory = (await ethers.getContractFactory(
        "PoolSwapLibrary",
        signers[0]
    )) as PoolSwapLibrary__factory
    const library = await libraryFactory.deploy()
    await library.deployed()
    const PoolFactory = (await ethers.getContractFactory("PoolFactory", {
        signer: signers[0],
        libraries: { PoolSwapLibrary: library.address },
    })) as PoolFactory__factory
    const factory = await (
        await PoolFactory.deploy(generateRandomAddress(), signers[0].address)
    ).deployed()

    const poolKeeperFactory = (await ethers.getContractFactory("PoolKeeper", {
        signer: signers[0],
    })) as PoolKeeper__factory
    const poolKeeper = await poolKeeperFactory.deploy(factory.address)
    await poolKeeper.deployed()

    await factory.connect(signers[0]).setPoolKeeper(poolKeeper.address)

    const keeperRewardsFactory = (await ethers.getContractFactory(
        "KeeperRewards",
        {
            signer: signers[0],
            libraries: { PoolSwapLibrary: library.address },
        }
    )) as KeeperRewards__factory
    let keeperRewards = await keeperRewardsFactory.deploy(poolKeeper.address)

    await poolKeeper.setKeeperRewards(keeperRewards.address)

    const invariantCheckFactory = (await ethers.getContractFactory(
        "InvariantCheck",
        signers[0]
    )) as InvariantCheck__factory

    const invariantCheck = await invariantCheckFactory.deploy(factory.address)
    await factory.setInvariantCheck(invariantCheck.address)

    const autoClaimFactory = (await ethers.getContractFactory("AutoClaim", {
        signer: signers[0],
    })) as AutoClaim__factory
    let autoClaim = await autoClaimFactory.deploy(factory.address)
    autoClaim = await autoClaim.deployed()
    await factory.setAutoClaim(autoClaim.address)

    // Create pool
    const deploymentData = {
        poolName: POOL_CODE,
        frontRunningInterval: 1,
        updateInterval: 2,
        leverageAmount: 1,
        settlementToken: settlementToken,
        oracleWrapper: oracleWrapper.address,
        settlementEthOracle: settlementEthOracle.address,
        feeController: signers[0].address,
        mintingFee: 0,
        burningFee: 0,
        changeInterval: 0,
    }
    await factory.deployPool(deploymentData)

    const deploymentData2 = {
        poolName: POOL_CODE_2,
        frontRunningInterval: 1,
        updateInterval: 2,
        leverageAmount: 2,
        settlementToken: settlementToken,
        oracleWrapper: oracleWrapper.address,
        settlementEthOracle: settlementEthOracle.address,
        feeController: signers[0].address,
        mintingFee: 0,
        burningFee: 0,
        changeInterval: 0,
    }
    await factory.deployPool(deploymentData2)

    return { token, factory, l2Encoder, poolKeeper }
}
