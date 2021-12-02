import { ethers, network } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { generateRandomAddress, incrementPrice } from "../utilities"

import { POOL_CODE, POOL_CODE_2 } from "../constants"
import {
    TestChainlinkOracle,
    ChainlinkOracleWrapper,
    ChainlinkOracleWrapper__factory,
    TestChainlinkOracle__factory,
    PriceObserver__factory,
    PriceObserver,
    PoolFactory__factory,
    PoolKeeper,
    PoolKeeper__factory,
    PoolSwapLibrary__factory,
    TestToken__factory,
    PoolFactory,
    AutoClaim__factory,
    InvariantCheck__factory,
} from "../../types"

chai.use(chaiAsPromised)
const { expect } = chai

let quoteToken: string
let oracleWrapper: ChainlinkOracleWrapper
let settlementEthOracle: ChainlinkOracleWrapper
let oracle: TestChainlinkOracle
let ethOracle: TestChainlinkOracle
let poolKeeper: PoolKeeper
let factory: PoolFactory

const forwardTime = async (seconds: number) => {
    await network.provider.send("evm_increaseTime", [seconds])
    await network.provider.send("evm_mine", [])
}

const setupHook = async () => {
    const signers = await ethers.getSigners()
    // Deploy quote token
    const testToken = (await ethers.getContractFactory(
        "TestToken",
        signers[0]
    )) as TestToken__factory
    const token = await testToken.deploy("TEST TOKEN", "TST1")
    await token.deployed()
    await token.mint(10000, signers[0].address)
    quoteToken = token.address

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
        libraries: { PoolSwapLibrary: library.address },
    })) as PoolKeeper__factory
    const PoolFactory = (await ethers.getContractFactory("PoolFactory", {
        signer: signers[0],
        libraries: { PoolSwapLibrary: library.address },
    })) as PoolFactory__factory
    factory = await (
        await PoolFactory.deploy(generateRandomAddress())
    ).deployed()

    const autoClaimFactory = (await ethers.getContractFactory("AutoClaim", {
        signer: signers[0],
    })) as AutoClaim__factory
    let autoClaim = await autoClaimFactory.deploy(factory.address)
    autoClaim = await autoClaim.deployed()
    await factory.setAutoClaim(autoClaim.address)

    poolKeeper = await poolKeeperFactory.deploy(factory.address)
    await poolKeeper.deployed()

    /* deploy price observer contract */
    const priceObserverFactory = (await ethers.getContractFactory(
        "PriceObserver",
        signers[0]
    )) as PriceObserver__factory
    const priceObserver: PriceObserver = await priceObserverFactory.deploy()
    await priceObserver.deployed()
    await priceObserver.setWriter(oracleWrapper.address)

    /* inform PoolKeeper of our newly-deployed PriceObserver contract */
    await poolKeeper.setPriceObserver(priceObserver.address)

    await factory.connect(signers[0]).setPoolKeeper(poolKeeper.address)

    const invariantCheckFactory = (await ethers.getContractFactory(
        "InvariantCheck",
        signers[0]
    )) as InvariantCheck__factory

    const invariantCheck = await invariantCheckFactory.deploy(factory.address)

    // Create pool
    const deploymentData = {
        poolName: POOL_CODE,
        frontRunningInterval: 1,
        updateInterval: 2,
        leverageAmount: 1,
        quoteToken: quoteToken,
        oracleWrapper: oracleWrapper.address,
        settlementEthOracle: settlementEthOracle.address,
        invariantCheckContract: invariantCheck.address,
    }
    await factory.deployPool(deploymentData)

    const deploymentData2 = {
        poolName: POOL_CODE_2,
        frontRunningInterval: 1,
        updateInterval: 2,
        leverageAmount: 2,
        quoteToken: quoteToken,
        oracleWrapper: oracleWrapper.address,
        settlementEthOracle: settlementEthOracle.address,
        invariantCheckContract: invariantCheck.address,
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
        await poolKeeper.performUpkeepMultiplePools(poolAddresses)
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
