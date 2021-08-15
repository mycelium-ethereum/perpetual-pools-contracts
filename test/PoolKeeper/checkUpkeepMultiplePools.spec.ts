import { ethers, network } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { generateRandomAddress } from "../utilities"

import { MARKET_2, POOL_CODE, POOL_CODE_2 } from "../constants"
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
} from "../../typechain"

chai.use(chaiAsPromised)
const { expect } = chai

let quoteToken: string
let oracleWrapper: ChainlinkOracleWrapper
let ethOracleWrapper: ChainlinkOracleWrapper
let keeperOracle: ChainlinkOracleWrapper
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
    ethOracle = await(await oracleFactory.deploy()).deployed()
    await ethOracle.setPrice(3000 * 10 ** 8)
    await oracle.deployed()
    const oracleWrapperFactory = (await ethers.getContractFactory(
        "ChainlinkOracleWrapper",
        signers[0]
    )) as ChainlinkOracleWrapper__factory
    oracleWrapper = await oracleWrapperFactory.deploy(oracle.address)
    await oracleWrapper.deployed()
    ethOracleWrapper = await oracleWrapperFactory.deploy(ethOracle.address)
    await ethOracleWrapper.deployed()

    keeperOracle = await oracleWrapperFactory.deploy(oracle.address)
    await keeperOracle.deployed()

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
        await PoolFactory.deploy(generateRandomAddress())
    ).deployed()

    await factory.setPoolCommitterDeployer(generateRandomAddress())

    poolKeeper = await poolKeeperFactory.deploy(factory.address, ethOracleWrapper.address)
    await poolKeeper.deployed()
    await factory.connect(signers[0]).setPoolKeeper(poolKeeper.address)

    // Create pool
    const deploymentData = {
        poolName: POOL_CODE,
        frontRunningInterval: 1,
        updateInterval: 2,
        leverageAmount: 1,
        quoteToken: quoteToken,
        oracleWrapper: oracleWrapper.address,
        keeperOracle: keeperOracle.address,
    }
    await factory.deployPool(deploymentData)

    const deploymentData2 = {
        poolName: POOL_CODE_2,
        frontRunningInterval: 1,
        updateInterval: 2,
        leverageAmount: 2,
        quoteToken: quoteToken,
        oracleWrapper: oracleWrapper.address,
        keeperOracle: keeperOracle.address,
    }
    await factory.deployPool(deploymentData2)
}
describe("PoolKeeper - checkUpkeepMultiplePools", () => {
    /*
    beforeEach(async () => {
        await setupHook()
    })
    it("should return true if the trigger condition is met", async () => {
        let poolAddresses = [await factory.pools(0), await factory.pools(1)]
        await forwardTime(5)
        await oracleWrapper.incrementPrice()
        expect(await poolKeeper.checkUpkeepMultiplePools(poolAddresses)).to.eq(
            true
        )
    })
    it("should return true if the trigger condition is met on only one", async () => {
        let poolAddresses = [await factory.pools(0), await factory.pools(1)]
        await forwardTime(5)
        await oracleWrapper.incrementPrice()
        await poolKeeper.performUpkeepSinglePool(poolAddresses[0])
        expect(await poolKeeper.checkUpkeepMultiplePools(poolAddresses)).to.eq(
            true
        )
    })
    it("should return false if the trigger condition isn't met", async () => {
        let poolAddresses = [await factory.pools(0), await factory.pools(1)]
        await forwardTime(5)
        await oracleWrapper.incrementPrice()
        await poolKeeper.performUpkeepMultiplePools(poolAddresses)
        expect(await poolKeeper.checkUpkeepMultiplePools(poolAddresses)).to.eq(
            false
        )
    })
    it("should return false if the check data provided is invalid", async () => {
        let poolAddresses = [await factory.pools(0), await factory.pools(1)]
        await forwardTime(5)
        expect(await poolKeeper.checkUpkeepMultiplePools(poolAddresses)).to.eq(
            false
        )
    })
    */
})
