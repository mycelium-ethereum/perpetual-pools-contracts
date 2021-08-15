import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    createCommit,
    generateRandomAddress,
    getEventArgs,
    timeout,
} from "../../utilities"

import { MARKET_2, POOL_CODE, POOL_CODE_2 } from "../../constants"
import {
    PoolCommitter,
    PoolCommitterDeployer__factory,
    PoolFactory,
    PoolFactory__factory,
    PoolKeeper,
    PoolKeeper__factory,
    PoolSwapLibrary__factory,
    TestChainlinkOracle__factory,
    TestOracleWrapper,
    TestOracleWrapper__factory,
    TestToken,
    TestToken__factory,
} from "../../../typechain"
import { BigNumber } from "ethers"
import { Result } from "ethers/lib/utils"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

let quoteToken: string
let oracleWrapper: TestOracleWrapper
let keeperOracle: TestOracleWrapper
let poolKeeper: PoolKeeper
let pool: any
let POOL1_ADDR: string
let POOL2_ADDR: string
let signers: SignerWithAddress[]
let token: TestToken

const updateInterval = 10

const setupHook = async () => {
    signers = await ethers.getSigners()

    // Deploy quote token
    const testToken = (await ethers.getContractFactory(
        "TestToken",
        signers[0]
    )) as TestToken__factory
    token = await testToken.deploy("TEST TOKEN", "TST1")
    await token.deployed()
    await token.mint(ethers.utils.parseEther("10000"), signers[0].address)
    quoteToken = token.address

    const chainlinkOracleFactory = (await ethers.getContractFactory(
        "TestChainlinkOracle",
        signers[0]
    )) as TestChainlinkOracle__factory
    const chainlinkOracle = await chainlinkOracleFactory.deploy()

    // Deploy oracle. Using a test oracle for predictability
    const oracleWrapperFactory = (await ethers.getContractFactory(
        "TestOracleWrapper",
        signers[0]
    )) as TestOracleWrapper__factory
    oracleWrapper = await oracleWrapperFactory.deploy(chainlinkOracle.address)
    await oracleWrapper.deployed()

    keeperOracle = await oracleWrapperFactory.deploy(chainlinkOracle.address)
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
    // TODO replace addresses with the two new deployers
    const factory: PoolFactory = await (
        await PoolFactory.deploy(generateRandomAddress())
    ).deployed()

    const PoolCommiterDeployerFactory = (await ethers.getContractFactory(
        "PoolCommitterDeployer",
        {
            signer: signers[0],
            libraries: { PoolSwapLibrary: library.address },
        }
    )) as PoolCommitterDeployer__factory

    let poolCommitterDeployer = await PoolCommiterDeployerFactory.deploy(
        factory.address
    )
    poolCommitterDeployer = await poolCommitterDeployer.deployed()

    await factory.setPoolCommitterDeployer(poolCommitterDeployer.address)
    poolKeeper = await poolKeeperFactory.deploy(factory.address)
    await poolKeeper.deployed()
    await factory.setPoolKeeper(poolKeeper.address)

    await oracleWrapper.incrementPrice()
    // Create pool
    const deploymentData = {
        poolName: POOL_CODE,
        frontRunningInterval: 1,
        updateInterval: updateInterval,
        leverageAmount: 1,
        quoteToken: quoteToken,
        oracleWrapper: oracleWrapper.address,
        keeperOracle: keeperOracle.address,
    }
    await (await factory.deployPool(deploymentData)).wait()

    await oracleWrapper.incrementPrice()
    const deploymentData2 = {
        poolName: POOL_CODE_2,
        frontRunningInterval: 1,
        updateInterval: updateInterval,
        leverageAmount: 2,
        quoteToken: quoteToken,
        oracleWrapper: oracleWrapper.address,
        keeperOracle: keeperOracle.address,
    }
    await (await factory.deployPool(deploymentData2)).wait()

    // get pool addresses
    POOL1_ADDR = await factory.pools(0)
    POOL2_ADDR = await factory.pools(1)

    pool = await ethers.getContractAt("LeveragedPool", POOL1_ADDR)
    const poolCommitter: any = await ethers.getContractAt(
        "PoolCommitter",
        await pool.poolCommitter()
    )
    const amountCommitted = ethers.utils.parseEther("2000")
    await token.approve(pool.address, ethers.utils.parseEther("99999999"))
    const commit = await createCommit(poolCommitter, [2], amountCommitted)
    await timeout(updateInterval * 1000 * 2)
    await pool.setKeeper(signers[0].address)
    await pool.poolUpkeep(9, 10)
}

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
    let oldLastExecutionTime: BigNumber
    let newLastExecutionTime: BigNumber
    describe("Base cases", () => {
        beforeEach(setupHook)
        it("should not revert if performData is invalid", async () => {
            await pool.setKeeper(poolKeeper.address)
            await poolKeeper.performUpkeepMultiplePools([
                POOL1_ADDR,
                POOL2_ADDR,
            ])
        })
    })

    describe("Upkeep - Price execution", () => {
        let event: Result | undefined
        let lastTime: BigNumber
        before(async () => {
            await setupHook()
            // process a few upkeeps
            lastTime = await poolKeeper.lastExecutionTime(POOL1_ADDR)
            await oracleWrapper.incrementPrice()
            await timeout(updateInterval * 1000 + 1000)
            await pool.setKeeper(poolKeeper.address)
            const result = await (
                await poolKeeper.performUpkeepMultiplePools([
                    POOL1_ADDR,
                    POOL2_ADDR,
                ])
            ).wait()
            oldExecutionPrice = await poolKeeper.executionPrice(POOL1_ADDR)
            event = getEventArgs(result, "ExecutePriceChange")
        })
        it("should emit an event with the details", async () => {
            expect(event?.updateInterval).to.eq(updateInterval)
            expect(event?.newPrice).to.eq(oldExecutionPrice)
            expect(event?.pool).to.eq(POOL1_ADDR)
        })
    })

    describe("Upkeep - New round", () => {
        before(async () => {
            // Check starting conditions
            await setupHook()
            // process a few upkeeps
            await oracleWrapper.incrementPrice()

            oldLastExecutionTime = await poolKeeper.lastExecutionTime(
                POOL1_ADDR
            )
            oldExecutionPrice = await poolKeeper.executionPrice(POOL1_ADDR)
            // delay and upkeep again
            await timeout(updateInterval * 1000 + 1000)

            newLastExecutionPrice = await poolKeeper.executionPrice(POOL1_ADDR)
            await pool.setKeeper(poolKeeper.address)
            await poolKeeper.performUpkeepMultiplePools([
                POOL1_ADDR,
                POOL2_ADDR,
            ])
            newExecutionPrice = await poolKeeper.executionPrice(POOL1_ADDR)
            newLastExecutionTime = await poolKeeper.lastExecutionTime(
                POOL1_ADDR
            )
        })
        it("should clear the old round data", async () => {
            const price = ethers.utils.parseEther(
                (await oracleWrapper.getPrice()).toString()
            )
            expect(newLastExecutionTime.gt(oldLastExecutionTime)).to.equal(true)
            expect(newExecutionPrice.gt(oldExecutionPrice)).to.equal(true)
            expect(newExecutionPrice).to.equal(price)
        })
        it("Should update the keeper's balance", async () => {
            await timeout(updateInterval * 1000 + 1000)
            const balanceBefore = await token.balanceOf(signers[0].address)
            const poolTokenBalanceBefore = await token.balanceOf(pool.address)
            await poolKeeper.performUpkeepMultiplePools([
                POOL1_ADDR,
                POOL2_ADDR,
            ])
            const balanceAfter = await token.balanceOf(signers[0].address)
            const poolTokenBalanceAfter = await token.balanceOf(pool.address)
            expect(balanceAfter).to.be.gt(balanceBefore)
            expect(poolTokenBalanceAfter).to.be.lt(poolTokenBalanceBefore)
        })
        it("should calculate a new execution price", async () => {
            expect(newLastExecutionPrice).to.eq(oldExecutionPrice)
            expect(newExecutionPrice.gt(oldExecutionPrice)).to.equal(true)
        })
    })
})
