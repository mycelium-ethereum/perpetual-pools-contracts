import { ethers, network } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    generateRandomAddress,
    incrementPrice,
    performUpkeep,
} from "../utilities"

import { POOL_CODE, POOL_CODE_2 } from "../constants"
import {
    TestChainlinkOracle,
    ChainlinkOracleWrapper,
    ChainlinkOracleWrapper__factory,
    TestChainlinkOracle__factory,
    PoolFactory__factory,
    PoolKeeper,
    PoolKeeper__factory,
    PoolSwapLibrary__factory,
    TestToken__factory,
    PoolFactory,
    AutoClaim__factory,
    InvariantCheck__factory,
    L2Encoder__factory,
    L2Encoder,
} from "../../types"

chai.use(chaiAsPromised)
const { expect } = chai

let settlementToken: string
let oracleWrapper: ChainlinkOracleWrapper
let settlementEthOracle: ChainlinkOracleWrapper
let oracle: TestChainlinkOracle
let ethOracle: TestChainlinkOracle
let poolKeeper: PoolKeeper
let factory: PoolFactory
let l2Encoder: L2Encoder

const forwardTime = async (seconds: number) => {
    await network.provider.send("evm_increaseTime", [seconds])
    await network.provider.send("evm_mine", [])
}

const setupHook = async () => {
    const signers = await ethers.getSigners()
    const amount = 10000
    // Deploy settlement token
    const testToken = (await ethers.getContractFactory(
        "TestToken",
        signers[0]
    )) as TestToken__factory
    const token = await testToken.deploy("TEST TOKEN", "TST1")
    await token.deployed()
    await token.mint(signers[0].address, amount)
    settlementToken = token.address

    const l2EncoderFactory = (await ethers.getContractFactory(
        "L2Encoder",
        signers[0]
    )) as L2Encoder__factory
    l2Encoder = await l2EncoderFactory.deploy()
    await l2Encoder.deployed()

    // Deploy oracle. Using a test oracle for predictability
    const oracleFactory = (await ethers.getContractFactory(
        "TestChainlinkOracle",
        signers[0]
    )) as TestChainlinkOracle__factory
    oracle = await oracleFactory.deploy()
    await oracle.deployed()
    const oracleWrapperFactory = (await ethers.getContractFactory(
        "ChainlinkOracleWrapper",
        signers[0]
    )) as ChainlinkOracleWrapper__factory
    oracleWrapper = await oracleWrapperFactory.deploy(
        oracle.address,
        signers[0].address
    )
    await oracleWrapper.deployed()

    settlementEthOracle = await oracleWrapperFactory.deploy(
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
    const poolKeeperFactory = (await ethers.getContractFactory("PoolKeeper", {
        signer: signers[0],
    })) as PoolKeeper__factory
    const PoolFactory = (await ethers.getContractFactory("PoolFactory", {
        signer: signers[0],
        libraries: { PoolSwapLibrary: library.address },
    })) as PoolFactory__factory
    factory = await (
        await PoolFactory.deploy(generateRandomAddress(), signers[0].address)
    ).deployed()

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

    poolKeeper = await poolKeeperFactory.deploy(factory.address)
    await poolKeeper.deployed()

    await factory.connect(signers[0]).setPoolKeeper(poolKeeper.address)

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
}
describe("PoolKeeper - checkUpkeepMultiplePools", () => {
    let underlyingOracle: TestChainlinkOracle
    beforeEach(async () => {
        await setupHook()
        /* induce price increase */
        underlyingOracle = (await ethers.getContractAt(
            "TestChainlinkOracle",
            await oracleWrapper.oracle()
        )) as TestChainlinkOracle
    })
    it("should return true if the trigger condition is met", async () => {
        const poolAddresses = [await factory.pools(0), await factory.pools(1)]
        await forwardTime(5)
        expect(await poolKeeper.checkUpkeepMultiplePools(poolAddresses)).to.eq(
            true
        )
    })
    it("should return true if the trigger condition is met on only one", async () => {
        const poolAddresses = [await factory.pools(0), await factory.pools(1)]
        await forwardTime(5)
        await poolKeeper.performUpkeepSinglePool(poolAddresses[0])
        expect(await poolKeeper.checkUpkeepMultiplePools(poolAddresses)).to.eq(
            true
        )
    })
    it("should return false if the trigger condition isn't met (no unkeep)", async () => {
        const poolAddresses = [await factory.pools(0), await factory.pools(1)]
        expect(await poolKeeper.checkUpkeepMultiplePools(poolAddresses)).to.eq(
            false
        )
    })
    it("should return false if the trigger condition isn't met after upkeep", async () => {
        const poolAddresses = [await factory.pools(0), await factory.pools(1)]
        await forwardTime(5)
        await incrementPrice(underlyingOracle)
        await performUpkeep(poolAddresses, poolKeeper, l2Encoder)
        expect(await poolKeeper.checkUpkeepMultiplePools(poolAddresses)).to.eq(
            false
        )
    })
    it("should return false if no pools valid", async () => {
        const poolAddresses = [
            generateRandomAddress(),
            generateRandomAddress(),
            generateRandomAddress(),
        ]
        await forwardTime(5)
        await incrementPrice(underlyingOracle)
        expect(await poolKeeper.checkUpkeepMultiplePools(poolAddresses)).to.eq(
            false
        )
    })
})
