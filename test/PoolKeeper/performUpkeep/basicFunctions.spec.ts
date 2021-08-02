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
    poolKeeper = await poolKeeperFactory.deploy(factory.address)
    await poolKeeper.deployed()

    await oracleWrapper.increasePrice()
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

    await oracleWrapper.increasePrice()
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
    let oldExecutionPrice: BigNumber
    let newExecutionPrice: BigNumber
    let oldLastExecutionPrice: BigNumber
    let newLastExecutionPrice: BigNumber
    let oldRoundStart: BigNumber
    let newRoundStart: BigNumber
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

    describe("Upkeep - Price execution", () => {
        let event: Result | undefined
        let lastTime: BigNumber
        before(async () => {
            await setupHook()
            // process a few upkeeps
            lastTime = await poolKeeper.lastExecutionTime(POOL_CODE)
            await oracleWrapper.increasePrice()
            await timeout(updateInterval * 1000 + 1000)
            const result = await (
                await poolKeeper.performUpkeep(callData)
            ).wait()
            oldExecutionPrice = await poolKeeper.executionPrice(POOL_CODE)
            oldLastExecutionPrice = await poolKeeper.lastExecutionPrice(
                POOL_CODE
            )
            event = getEventArgs(result, "ExecutePriceChange")
        })
        it("should emit an event with the details", async () => {
            expect(event?.updateInterval).to.eq(updateInterval)
            expect(event?.oldPrice).to.eq(oldLastExecutionPrice)
            expect(event?.newPrice).to.eq(oldExecutionPrice)
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

            oldRoundStart = await poolKeeper.poolRoundStart(POOL_CODE)
            oldExecutionPrice = await poolKeeper.executionPrice(POOL_CODE)
            // delay and upkeep again
            await timeout(updateInterval * 1000 + 1000)

            await poolKeeper.performUpkeep(callData)
            newExecutionPrice = await poolKeeper.executionPrice(POOL_CODE)
            newLastExecutionPrice = await poolKeeper.lastExecutionPrice(
                POOL_CODE
            )
            newRoundStart = await poolKeeper.poolRoundStart(POOL_CODE)
        })
        it("should clear the old round data", async () => {
            const price = await oracleWrapper.getPrice()
            expect(newRoundStart).to.be.greaterThan(oldRoundStart)
            expect(newExecutionPrice).to.be.greaterThan(oldExecutionPrice)
            expect(newExecutionPrice).to.equal(price)
        })
        it("should calculate a new execution price", async () => {
            expect(newLastExecutionPrice).to.eq(oldRound.executionPrice)
        })
    })
})
