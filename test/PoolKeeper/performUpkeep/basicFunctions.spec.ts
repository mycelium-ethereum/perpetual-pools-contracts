import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { generateRandomAddress, getEventArgs, timeout } from "../../utilities"

import { MARKET_2, POOL_CODE } from "../../constants"
import {
    PoolFactory__factory,
    PoolKeeper,
    PoolKeeper__factory,
    PoolSwapLibrary__factory,
    TestOracleWrapper,
    TestOracleWrapper__factory,
    TestToken__factory,
} from "../../../typechain"
import { MARKET, POOL_CODE_2 } from "../../constants"
import { BigNumber } from "ethers"
import { Result } from "ethers/lib/utils"
import { count } from "console"

chai.use(chaiAsPromised)
const { expect } = chai

let quoteToken: string
let oracleWrapper: TestOracleWrapper
let poolKeeper: PoolKeeper

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
    const oracleWrapperFactory = (await ethers.getContractFactory(
        "TestOracleWrapper",
        signers[0]
    )) as TestOracleWrapper__factory
    oracleWrapper = await oracleWrapperFactory.deploy()
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
    const factory = await (await PoolFactory.deploy()).deployed()
    poolKeeper = await poolKeeperFactory.deploy(
        oracleWrapper.address,
        factory.address
    )
    await poolKeeper.deployed()

    // Create pool
    await poolKeeper.createMarket(MARKET, oracleWrapper.address)
    await oracleWrapper.increasePrice()

    await poolKeeper.createPool(
        MARKET,
        POOL_CODE,
        updateInterval,
        1,
        "0x00000000000000000000000000000000",
        1,
        generateRandomAddress(),
        quoteToken
    )
    await oracleWrapper.increasePrice()
    await poolKeeper.createPool(
        MARKET,
        POOL_CODE_2,
        updateInterval,
        1,
        "0x00000000000000000000000000000000",
        2,
        generateRandomAddress(),
        quoteToken
    )
}
const callData = ethers.utils.defaultAbiCoder.encode(
    [
        ethers.utils.ParamType.from("uint32"),
        ethers.utils.ParamType.from("string"),
        ethers.utils.ParamType.from("string[]"),
    ],
    [updateInterval, MARKET, [POOL_CODE, POOL_CODE_2]]
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
describe("PoolKeeper - performUpkeep: basic functionality", () => {
    let oldRound: Upkeep
    let newRound: Upkeep
    describe("Base cases", () => {
        beforeEach(setupHook)
        it("should revert if performData is invalid", async () => {
            await expect(
                poolKeeper.performUpkeep(
                    ethers.utils.defaultAbiCoder.encode(
                        [
                            ethers.utils.ParamType.from("string"),
                            ethers.utils.ParamType.from("string[]"),
                        ],
                        [MARKET_2, [POOL_CODE, POOL_CODE_2]]
                    )
                )
            ).to.be.rejectedWith(Error)
        })
    })
    describe("Upkeep - Price averaging", () => {
        let price: BigNumber
        before(async () => {
            // Check starting conditions
            await setupHook()

            await timeout(updateInterval * 1000 + 1000)
            await oracleWrapper.increasePrice()
            price = await oracleWrapper.getPrice(MARKET)
            await poolKeeper.performUpkeep(callData)
            await oracleWrapper.increasePrice()
            await poolKeeper.performUpkeep(callData)
            await oracleWrapper.increasePrice()
            await poolKeeper.performUpkeep(callData)
        })
        it("should update the cumulative price for the market+pools in performData", async () => {
            expect(
                (await poolKeeper.upkeep(MARKET, updateInterval))
                    .cumulativePrice
            ).to.eq(price.add(price.add(1)).add(price.add(2)))
        })
        it("should update the count for the market+pools in performData", async () => {
            expect(
                (await poolKeeper.upkeep(MARKET, updateInterval)).count
            ).to.eq(3)
        })
    })
    describe("Upkeep - Price execution", () => {
        let event: Result | undefined
        let lastTime: number
        before(async () => {
            await setupHook()
            // process a few upkeeps
            lastTime = await poolKeeper.lastExecutionTime(callData)
            await oracleWrapper.increasePrice()
            await timeout(updateInterval * 1000 + 1000)
            const result = await (
                await poolKeeper.performUpkeep(callData)
            ).wait()
            oldRound = await poolKeeper.upkeep(MARKET, updateInterval)
            event = getEventArgs(result, "ExecutePriceChange")
        })
        it("should emit an event with the details", async () => {
            expect(event?.updateInterval).to.eq(updateInterval)
            expect(event?.oldPrice).to.eq(oldRound.lastExecutionPrice)
            expect(event?.newPrice).to.eq(oldRound.executionPrice)
            expect(event?.market).to.eq(MARKET)
            expect(event?.pool).to.eq(POOL_CODE)
        })
        it("should set last execution time", async () => {
            expect(
                await poolKeeper.lastExecutionTime(POOL_CODE)
            ).to.be.greaterThan(lastTime)
        })
    })
    describe("Upkeep - New round", () => {
        before(async () => {
            // Check starting conditions
            await setupHook()
            // process a few upkeeps
            await oracleWrapper.increasePrice()
            // await poolKeeper.performUpkeep(callData);

            oldRound = await poolKeeper.upkeep(MARKET, updateInterval)
            // delay and upkeep again
            await timeout(updateInterval * 1000 + 1000)

            await poolKeeper.performUpkeep(callData)
            newRound = await poolKeeper.upkeep(MARKET, updateInterval)
        })
        it("should clear the old round data", async () => {
            const price = await oracleWrapper.getPrice(MARKET)
            expect(newRound.count).to.eq(1)
            expect(newRound.roundStart).to.be.greaterThan(oldRound.roundStart)
            expect(newRound.cumulativePrice).to.eq(price)
            expect(newRound.lastSamplePrice).to.eq(price)
        })
        it("should calculate a new execution price", async () => {
            expect(newRound.lastExecutionPrice).to.eq(oldRound.executionPrice)
            expect(newRound.executionPrice).to.eq(
                ethers.utils
                    .parseEther(oldRound.cumulativePrice.toString())
                    .div(oldRound.count)
            )
        })
    })
})
