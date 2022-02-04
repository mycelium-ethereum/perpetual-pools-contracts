import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    createCommit,
    deployPoolAndTokenContracts,
    generateRandomAddress,
    getEventArgs,
    timeout,
} from "../../utilities"

import {
    DEFAULT_FEE,
    DEFAULT_MINT_AMOUNT,
    POOL_CODE,
    POOL_CODE_2,
    SINGLE_POOL_UPKEEP_GAS_COST,
} from "../../constants"
import {
    PoolKeeper,
    ChainlinkOracleWrapper,
    TestToken,
    TestChainlinkOracle,
    ChainlinkOracleWrapper__factory,
    InvariantCheck__factory,
    PoolFactory__factory,
    PoolKeeper__factory,
    PoolSwapLibrary__factory,
    PriceObserver,
    PriceObserver__factory,
    TestChainlinkOracle__factory,
    TestToken__factory,
} from "../../../types"
import { BigNumber } from "ethers"
import { Result } from "ethers/lib/utils"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

let derivativeChainlinkOracle: TestChainlinkOracle
let derivativeOracleWrapper: ChainlinkOracleWrapper
let poolKeeper: PoolKeeper
let pool: any
let pool2: any
let POOL1_ADDR: string
let POOL2_ADDR: string
let signers: SignerWithAddress[]
let token: TestToken

const updateInterval = 10
const frontRunningInterval = 1
const fee = DEFAULT_FEE
const feeAddress = generateRandomAddress()
const mintAmount = DEFAULT_MINT_AMOUNT

const setupHook = async () => {
    /* NOTE: settlementToken in this test is the same as the derivative oracle */
    const contracts1 = await deployPoolAndTokenContracts(
        POOL_CODE,
        frontRunningInterval,
        updateInterval,
        1,
        feeAddress,
        fee
    )
    const poolCommitter = contracts1.poolCommitter
    const contracts2 = await deployPoolAndTokenContracts(
        POOL_CODE_2,
        frontRunningInterval,
        updateInterval,
        2,
        feeAddress,
        fee
    )
    const poolCommitter2 = contracts2.poolCommitter
    token = contracts1.token
    const token2 = contracts2.token
    pool = contracts1.pool
    pool2 = contracts2.pool
    signers = await ethers.getSigners()
    poolKeeper = contracts1.poolKeeper
    derivativeChainlinkOracle = contracts1.chainlinkOracle
    derivativeOracleWrapper = contracts1.oracleWrapper
    await token.approve(pool.address, mintAmount)
    await token2.approve(pool2.address, mintAmount)
    await createCommit(poolCommitter, [2], mintAmount.div(2))
    await createCommit(poolCommitter2, [2], mintAmount.div(2))
    await timeout(updateInterval * 1000 * 2)
    await pool.setKeeper(signers[0].address)
    await pool.poolUpkeep(9, 10)
    POOL1_ADDR = pool.address
    POOL2_ADDR = pool2.address
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
        it("should revert if observer is uninitialized", async () => {
            const amountMinted = DEFAULT_MINT_AMOUNT

            const signers = await ethers.getSigners()
            // Deploy test ERC20 token
            const testToken = (await ethers.getContractFactory(
                "TestToken",
                signers[0]
            )) as TestToken__factory
            const token = await testToken.deploy("TEST TOKEN", "TST1")
            await token.deployed()
            await token.mint(signers[0].address, amountMinted)

            // Deploy tokens
            const poolTokenFactory = (await ethers.getContractFactory(
                "TestToken",
                signers[0]
            )) as TestToken__factory
            const short = await poolTokenFactory.deploy("Short token", "SHORT")
            await short.deployed()

            const long = await poolTokenFactory.deploy("Long", "Long")
            await long.deployed()

            const chainlinkOracleFactory = (await ethers.getContractFactory(
                "TestChainlinkOracle",
                signers[0]
            )) as TestChainlinkOracle__factory
            const chainlinkOracle = await (
                await chainlinkOracleFactory.deploy()
            ).deployed()
            const ethOracle = await (
                await chainlinkOracleFactory.deploy()
            ).deployed()
            await ethOracle.setPrice(3000 * 10 ** 8)

            // Deploy tokens
            const oracleWrapperFactory = (await ethers.getContractFactory(
                "ChainlinkOracleWrapper",
                signers[0]
            )) as ChainlinkOracleWrapper__factory

            const oracleWrapper = await oracleWrapperFactory.deploy(
                chainlinkOracle.address,
                signers[0].address
            )

            // Deploy and initialise pool
            const libraryFactory = (await ethers.getContractFactory(
                "PoolSwapLibrary",
                signers[0]
            )) as PoolSwapLibrary__factory
            const library = await libraryFactory.deploy()
            await library.deployed()

            const PoolFactory = (await ethers.getContractFactory(
                "PoolFactory",
                {
                    signer: signers[0],
                    libraries: { PoolSwapLibrary: library.address },
                }
            )) as PoolFactory__factory

            const factory = await (
                await PoolFactory.deploy(
                    generateRandomAddress(),
                    signers[0].address
                )
            ).deployed()

            const poolKeeperFactory = (await ethers.getContractFactory(
                "PoolKeeper",
                {
                    signer: signers[0],
                    libraries: { PoolSwapLibrary: library.address },
                }
            )) as PoolKeeper__factory
            let poolKeeper = await poolKeeperFactory.deploy(factory.address)
            poolKeeper = await poolKeeper.deployed()
            await pool.setKeeper(poolKeeper.address)
            await expect(
                poolKeeper.performUpkeepMultiplePools([POOL1_ADDR, POOL2_ADDR])
            ).to.be.revertedWith("Observer not initialized")
        })
    })

    describe("Upkeep - Price execution", () => {
        let event: Result | undefined
        let upkeepEvent: Result | undefined
        let lastTime: BigNumber
        before(async () => {
            await setupHook()
            // process a few upkeeps
            lastTime = await pool.lastPriceTimestamp()
            await timeout(updateInterval * 1000 + 1000)
            await pool.setKeeper(poolKeeper.address)
            oldExecutionPrice = await poolKeeper.executionPrice(POOL1_ADDR)
            const result = await (
                await poolKeeper.performUpkeepMultiplePools([
                    POOL1_ADDR,
                    POOL2_ADDR,
                ])
            ).wait()
            newExecutionPrice = await poolKeeper.executionPrice(POOL1_ADDR)
            event = getEventArgs(result, "KeeperPaid")
            upkeepEvent = getEventArgs(result, "UpkeepSuccessful")
        })
        it("should emit an event with the details", async () => {
            expect(event?.keeper).to.eq(signers[0].address)
        })
        it("should emit an UpkeepSuccessful event", async () => {
            expect(upkeepEvent?.startPrice).to.eq(oldExecutionPrice)
            expect(upkeepEvent?.endPrice).to.eq(newExecutionPrice)
        })
    })

    describe("Upkeep - New round", () => {
        before(async () => {
            // Check starting conditions
            await setupHook()
            // process a few upkeeps

            oldLastExecutionTime = await pool.lastPriceTimestamp()
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
            newLastExecutionTime = await pool.lastPriceTimestamp()
        })
        it("should clear the old round data", async () => {
            const price = await derivativeOracleWrapper.getPrice()
            expect(newLastExecutionTime.gt(oldLastExecutionTime)).to.equal(true)
            expect(newExecutionPrice).to.be.lt(oldExecutionPrice)
            expect(newExecutionPrice).to.equal(price)
        })
        it("Should update the keeper's balance", async () => {
            await timeout(updateInterval * 1000 + 1000)
            const balanceBefore = await token.balanceOf(signers[0].address)
            const poolTokenBalanceBefore = await token.balanceOf(pool.address)
            const receipt = await (
                await poolKeeper.performUpkeepMultiplePools([
                    POOL1_ADDR,
                    POOL2_ADDR,
                ])
            ).wait()

            const balanceAfter = await token.balanceOf(signers[0].address)
            const poolTokenBalanceAfter = await token.balanceOf(pool.address)
            const tenGwei = BigNumber.from("10").pow(9).mul(10)
            const tenToTheEighteen = BigNumber.from("10").pow(18)
            const tenToTheTen = BigNumber.from("10").pow(10)
            const settlementPerEth = BigNumber.from("3000").mul(
                BigNumber.from(10).pow(8)
            )

            const estimatedKeeperReward = BigNumber.from(
                SINGLE_POOL_UPKEEP_GAS_COST
            )
                .mul(tenGwei)
                .mul(settlementPerEth)
                .mul(2) // Mul by 2 because there are two pools
                .div(tenToTheEighteen.div(tenToTheTen))

            const epsilon = estimatedKeeperReward.mul(
                ethers.utils.parseEther("0.0000000000000001")
            )
            const lowerBound: any = estimatedKeeperReward.sub(epsilon)
            const upperBound: any = estimatedKeeperReward.add(epsilon)
            expect(balanceAfter).to.be.gt(balanceBefore)
            expect(poolTokenBalanceAfter).to.be.lt(poolTokenBalanceBefore)
        })
        it("should calculate a new execution price", async () => {
            expect(newLastExecutionPrice).to.eq(oldExecutionPrice)
            expect(newExecutionPrice).to.be.lt(oldExecutionPrice)
        })
    })
})
