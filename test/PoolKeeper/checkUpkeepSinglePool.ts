import { ethers, network } from "hardhat"
import chai from "chai"
import { Bytes, BytesLike } from "ethers"
import chaiAsPromised from "chai-as-promised"
import { generateRandomAddress, incrementPrice } from "../utilities"

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
    PoolCommitterDeployer,
    PoolCommitterDeployer__factory,
} from "../../typechain"

chai.use(chaiAsPromised)
const { expect } = chai

let signers: any
let quoteToken: string
let oracleWrapper: ChainlinkOracleWrapper
let settlementEthOracle: ChainlinkOracleWrapper
let oracle: TestChainlinkOracle
let poolKeeper: PoolKeeper
let factory: PoolFactory
let ethOracleWrapper: ChainlinkOracleWrapper
let ethOracle: TestChainlinkOracle

const forwardTime = async (seconds: number) => {
    await network.provider.send("evm_increaseTime", [seconds])
    await network.provider.send("evm_mine", [])
}

const setupHook = async () => {
    signers = await ethers.getSigners()
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
    ethOracle = await (await oracleFactory.deploy()).deployed()
    await ethOracle.setPrice(3000 * 10 ** 8)
    const oracleWrapperFactory = (await ethers.getContractFactory(
        "ChainlinkOracleWrapper",
        signers[0]
    )) as ChainlinkOracleWrapper__factory
    oracleWrapper = await oracleWrapperFactory.deploy(oracle.address)
    await oracleWrapper.deployed()
    ethOracleWrapper = await oracleWrapperFactory.deploy(ethOracle.address)
    await ethOracleWrapper.deployed()

    settlementEthOracle = await oracleWrapperFactory.deploy(oracle.address)
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
        await PoolFactory.deploy(generateRandomAddress())
    ).deployed()
    poolKeeper = await poolKeeperFactory.deploy(factory.address)
    await poolKeeper.deployed()
    await factory.connect(signers[0]).setPoolKeeper(poolKeeper.address)

    const PoolCommiterDeployerFactory = (await ethers.getContractFactory(
        "PoolCommitterDeployer",
        {
            signer: signers[0],
            libraries: { PoolSwapLibrary: library.address },
        }
    )) as PoolCommitterDeployer__factory

    let poolCommiterDeployer = await PoolCommiterDeployerFactory.deploy(
        factory.address
    )
    poolCommiterDeployer = await poolCommiterDeployer.deployed()

    await factory.setPoolCommitterDeployer(poolCommiterDeployer.address)
    // Create pool
    const deploymentData = {
        poolName: POOL_CODE,
        frontRunningInterval: 1,
        updateInterval: 2,
        leverageAmount: 1,
        quoteToken: quoteToken,
        oracleWrapper: oracleWrapper.address,
        settlementEthOracle: settlementEthOracle.address,
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
    }
    await factory.deployPool(deploymentData2)
}
describe("PoolKeeper - checkUpkeepSinglePool", () => {
    beforeEach(async () => {
        await setupHook()
    })
    it("should return true if the trigger condition is met", async () => {
        await forwardTime(5)

        /* induce price increase */
        let underlyingOracle: TestChainlinkOracle = (await ethers.getContractAt(
            "TestChainlinkOracle",
            await oracleWrapper.oracle()
        )) as TestChainlinkOracle
        await incrementPrice(underlyingOracle)

        let poolAddress = await factory.pools(0)
        expect(await poolKeeper.checkUpkeepSinglePool(poolAddress)).to.eq(true)
    })
    it("should return false if the trigger condition isn't met", async () => {
        await forwardTime(5)

        /* induce price increase */
        let underlyingOracle: TestChainlinkOracle = (await ethers.getContractAt(
            "TestChainlinkOracle",
            await oracleWrapper.oracle()
        )) as TestChainlinkOracle
        await incrementPrice(underlyingOracle)

        let poolAddress = await factory.pools(0)
        await poolKeeper.performUpkeepSinglePool(poolAddress)
        expect(await poolKeeper.checkUpkeepSinglePool(poolAddress)).to.eq(false)
    })

    it("should increase the keeper fee balance", async () => {
        await forwardTime(5)

        /* induce price increase */
        let underlyingOracle: TestChainlinkOracle = (await ethers.getContractAt(
            "TestChainlinkOracle",
            await oracleWrapper.oracle()
        )) as TestChainlinkOracle
        await incrementPrice(underlyingOracle)

        let keeperAddress = await signers[0].getAddress()

        let preUpkeepFee = await signers[0].getBalance()

        // perform upkeep
        let poolAddress = await factory.pools(0)
        let res = await poolKeeper.performUpkeepSinglePool(poolAddress)

        let postUpkeepFee = await signers[0].getBalance()

        expect(postUpkeepFee).to.gt(preUpkeepFee)
    })
})
