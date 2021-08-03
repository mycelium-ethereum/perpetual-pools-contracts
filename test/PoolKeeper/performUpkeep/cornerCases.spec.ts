import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { generateRandomAddress, getEventArgs, timeout } from "../../utilities"

import {
    PoolFactory,
    PoolFactory__factory,
    PoolKeeper,
    PoolKeeper__factory,
    PoolSwapLibrary__factory,
    TestChainlinkOracle,
    TestOracleWrapper__factory,
    TestChainlinkOracle__factory,
    TestOracleWrapper,
    TestOracleWrapper__factory,
    TestToken__factory,
} from "../../../typechain"
import { MARKET, POOL_CODE_2, MARKET_2, POOL_CODE } from "../../constants"
import { BigNumber } from "ethers"
import { Result } from "ethers/lib/utils"

chai.use(chaiAsPromised)
const { expect } = chai

let quoteToken: string
let oracleWrapper: TestOracleWrapper
let poolKeeper: PoolKeeper
let factory: PoolFactory
let oracle: TestChainlinkOracle
const updateInterval = 10

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
        "TestOracleWrapper",
        signers[0]
    )) as TestOracleWrapper__factory
    oracleWrapper = await oracleWrapperFactory.deploy(oracle.address)
    await oracleWrapper.deployed()

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
    factory = await (await PoolFactory.deploy()).deployed()
    poolKeeper = await poolKeeperFactory.deploy(factory.address)
    await poolKeeper.deployed()
    await factory.setPoolKeeper(poolKeeper.address)

    // Create pool
    const deploymentData = {
        owner: poolKeeper.address,
        poolCode: POOL_CODE,
        frontRunningInterval: 1,
        updateInterval: updateInterval,
        fee: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        leverageAmount: 1,
        feeAddress: generateRandomAddress(),
        quoteToken: quoteToken,
        oracleWrapper: oracleWrapper.address,
    }
    await (await factory.deployPool(deploymentData)).wait()

    const deploymentData2 = {
        owner: poolKeeper.address,
        poolCode: POOL_CODE_2,
        frontRunningInterval: 1,
        updateInterval: updateInterval,
        fee: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        leverageAmount: 2,
        feeAddress: generateRandomAddress(),
        quoteToken: quoteToken,
        oracleWrapper: oracleWrapper.address,
    }
    await (await factory.deployPool(deploymentData2)).wait()
}
const upkeepOne = ethers.utils.defaultAbiCoder.encode(
    [ethers.utils.ParamType.from("string[]")],
    [[POOL_CODE]]
)
const upkeepTwo = ethers.utils.defaultAbiCoder.encode(
    [ethers.utils.ParamType.from("string[]")],
    [[POOL_CODE_2]]
)
interface Upkeep {
    cumulativePrice: BigNumber
    lastSamplePrice: BigNumber
    executionPrice: BigNumber
    lastExecutionPrice: BigNumber
    count: number
    updateInterval: number
    roundStart: number
}
describe("PoolKeeper - performUpkeep: corner cases", () => {
    let oldLastExecutionPrice: BigNumber
    let oldExecutionPrice: BigNumber
    let upkeepOneEvent: Result | undefined
    let upkeepTwoEvent: Result | undefined
    describe("Multiple upkeep groups for the same market", () => {
        beforeEach(async () => {
            await setupHook()

            // Sample and execute the first upkeep group
            await (await oracleWrapper.increasePrice()).wait()
            await poolKeeper.performUpkeep(upkeepOne)
            await poolKeeper.performUpkeep(upkeepTwo)
            await timeout(updateInterval * 1000 + 1000) // TODO why this <- ?

            const upOne = await (
                await poolKeeper.performUpkeep(upkeepOne)
            ).wait()

            const upTwo = await (
                await poolKeeper.performUpkeep(upkeepTwo)
            ).wait()

            upkeepOneEvent = getEventArgs(upOne, "ExecutePriceChange")
            upkeepTwoEvent = getEventArgs(upTwo, "ExecutePriceChange")
            oldLastExecutionPrice = await poolKeeper.lastExecutionPrice(
                POOL_CODE
            )
            oldExecutionPrice = await poolKeeper.executionPrice(POOL_CODE)
        })
        it("should use the same price data for a second upkeep group in the same market", async () => {
            expect(upkeepOneEvent?.oldPrice).to.eq(oldLastExecutionPrice)
            expect(upkeepTwoEvent?.oldPrice).to.eq(oldLastExecutionPrice)
            expect(upkeepOneEvent?.newPrice).to.eq(oldExecutionPrice)
            expect(upkeepTwoEvent?.newPrice).to.eq(oldExecutionPrice)
        })
        it("should use the same price for a new round + execute transaction and an execution transaction that follows for a second upkeep group", async () => {
            await timeout(updateInterval * 1000 + 1000)

            const upOne = await (
                await poolKeeper.performUpkeep(upkeepOne)
            ).wait()
            const upTwo = await (
                await poolKeeper.performUpkeep(upkeepTwo)
            ).wait()
            upkeepOneEvent = getEventArgs(upOne, "ExecutePriceChange")
            upkeepTwoEvent = getEventArgs(upTwo, "ExecutePriceChange")
            expect(upkeepOneEvent?.newPrice).to.eq(upkeepTwoEvent?.newPrice)
            expect(upkeepOneEvent?.oldPrice).to.eq(upkeepTwoEvent?.oldPrice)
            expect(upkeepOneEvent?.updateInterval).to.eq(
                upkeepTwoEvent?.updateInterval
            )
        })
    })
})
