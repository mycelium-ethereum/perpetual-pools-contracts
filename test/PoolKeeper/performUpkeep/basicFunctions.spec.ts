import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    createCommit,
    generateRandomAddress,
    getEventArgs,
    incrementPrice,
    timeout,
} from "../../utilities"

import {
    MARKET_2,
    POOL_CODE,
    POOL_CODE_2,
    SINGLE_POOL_UPKEEP_GAS_COST,
} from "../../constants"
import {
    PoolCommitter,
    PoolCommitterDeployer__factory,
    PoolFactory,
    PoolFactory__factory,
    PoolKeeper,
    PoolKeeper__factory,
    PoolSwapLibrary__factory,
    TestChainlinkOracle__factory,
    ChainlinkOracleWrapper,
    ChainlinkOracleWrapper__factory,
    TestToken,
    TestToken__factory,
    TestChainlinkOracle,
} from "../../../typechain"
import { BigNumber } from "ethers"
import { Result } from "ethers/lib/utils"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

let quoteToken: string
let derivativeChainlinkOracle: TestChainlinkOracle
let derivativeOracleWrapper: ChainlinkOracleWrapper
let settlementEthChainlinkOracle: TestChainlinkOracle
let settlementEthOracle: ChainlinkOracleWrapper
let ethOracleWrapper: ChainlinkOracleWrapper
let poolKeeper: PoolKeeper
let pool: any
let pool2: any
let POOL1_ADDR: string
let POOL2_ADDR: string
let signers: SignerWithAddress[]
let token: TestToken

const updateInterval = 10

const setupHook = async () => {
    /* NOTE: settlementToken in this test is the same as the derivative oracle */
    signers = await ethers.getSigners()

    // Deploy quote token
    const testToken = (await ethers.getContractFactory(
        "TestToken",
        signers[0]
    )) as TestToken__factory
    token = await testToken.deploy("TEST TOKEN", "TST1")
    await token.deployed()
    await token.setDecimals(8)
    const mintAmount = ethers.utils.parseEther("1000") // An arbitrarily large amount
    await token.mint(mintAmount, signers[0].address)
    quoteToken = token.address

    const chainlinkOracleFactory = (await ethers.getContractFactory(
        "TestChainlinkOracle",
        signers[0]
    )) as TestChainlinkOracle__factory
    derivativeChainlinkOracle = await (
        await chainlinkOracleFactory.deploy()
    ).deployed()
    // $1
    await derivativeChainlinkOracle.setPrice(1 * 10 ** 8)
    settlementEthChainlinkOracle = await (
        await chainlinkOracleFactory.deploy()
    ).deployed()
    // 3000 STL/ETH
    await settlementEthChainlinkOracle.setPrice(3000 * 10 ** 8)

    // Deploy oracle. Using a test oracle for predictability
    const oracleWrapperFactory = (await ethers.getContractFactory(
        "ChainlinkOracleWrapper",
        signers[0]
    )) as ChainlinkOracleWrapper__factory
    // TODO fix
    derivativeOracleWrapper = await oracleWrapperFactory.deploy(
        derivativeChainlinkOracle.address
    )

    settlementEthOracle = await oracleWrapperFactory.deploy(
        settlementEthChainlinkOracle.address
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

    // Create pool
    const deploymentData = {
        poolName: POOL_CODE,
        frontRunningInterval: 1,
        updateInterval: updateInterval,
        leverageAmount: 1,
        quoteToken: quoteToken,
        oracleWrapper: derivativeOracleWrapper.address,
        settlementEthOracle: settlementEthOracle.address,
    }
    await (await factory.deployPool(deploymentData)).wait()

    const deploymentData2 = {
        poolName: POOL_CODE_2,
        frontRunningInterval: 1,
        updateInterval: updateInterval,
        leverageAmount: 2,
        quoteToken: quoteToken,
        oracleWrapper: derivativeOracleWrapper.address,
        settlementEthOracle: settlementEthOracle.address,
    }
    await (await factory.deployPool(deploymentData2)).wait()

    // get pool addresses
    POOL1_ADDR = await factory.pools(0)
    POOL2_ADDR = await factory.pools(1)

    pool = await ethers.getContractAt("LeveragedPool", POOL1_ADDR)
    pool2 = await ethers.getContractAt("LeveragedPool", POOL2_ADDR)
    const poolCommitter: any = await ethers.getContractAt(
        "PoolCommitter",
        await pool.poolCommitter()
    )
    const poolCommitter2: any = await ethers.getContractAt(
        "PoolCommitter",
        await pool2.poolCommitter()
    )
    await token.approve(pool.address, mintAmount)
    await token.approve(pool2.address, mintAmount)
    await createCommit(poolCommitter, [2], mintAmount.div(2))
    await createCommit(poolCommitter2, [2], mintAmount.div(2))
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
            // await oracleWrapper.incrementPrice()
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

            oldLastExecutionTime = await poolKeeper.lastExecutionTime(
                POOL1_ADDR
            )
            oldExecutionPrice = await poolKeeper.executionPrice(POOL1_ADDR)
            // delay and upkeep again
            await timeout(updateInterval * 1000 + 1000)

            newLastExecutionPrice = await poolKeeper.executionPrice(POOL1_ADDR)
            await derivativeChainlinkOracle.setPrice("90000000")
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
                (await derivativeOracleWrapper.getPrice()).toString()
            )
            expect(newLastExecutionTime.gt(oldLastExecutionTime)).to.equal(true)
            expect(newExecutionPrice).to.be.lt(oldExecutionPrice)
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
            const tenGwei = BigNumber.from("10").pow(9).mul(10)
            const tenToTheEighteen = BigNumber.from("10").pow(18)
            const settlementPerEth = BigNumber.from("3000").mul(
                BigNumber.from(10).pow(8)
            )

            const estimatedKeeperReward = BigNumber.from(
                SINGLE_POOL_UPKEEP_GAS_COST
            )
                .mul(tenGwei)
                .mul(settlementPerEth)
                .mul(2) // Mul by 2 because there are two pools
                .div(tenToTheEighteen)
            // EstimatedKeeperReward +/- 25% since it is quite hard to estimate
            const lowerBound: any = estimatedKeeperReward.sub(
                estimatedKeeperReward.div(4)
            )
            const upperBound: any = estimatedKeeperReward.add(
                estimatedKeeperReward.div(4)
            )
            expect(balanceAfter.sub(balanceBefore)).to.be.within(
                lowerBound,
                upperBound
            )
            expect(balanceAfter).to.be.gt(balanceBefore)
            expect(poolTokenBalanceAfter).to.be.lt(poolTokenBalanceBefore)
        })
        it("should calculate a new execution price", async () => {
            expect(newLastExecutionPrice).to.eq(oldExecutionPrice)
            expect(newExecutionPrice).to.be.lt(oldExecutionPrice)
        })
    })
})
