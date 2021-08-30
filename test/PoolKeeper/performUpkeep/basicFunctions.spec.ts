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
    DEFAULT_MINT_AMOUNT,
    MARKET_2,
    POOL_CODE,
    POOL_CODE_2,
    SINGLE_POOL_UPKEEP_GAS_COST,
} from "../../constants"
import {
    PoolKeeper,
    ChainlinkOracleWrapper,
    TestToken,
    TestChainlinkOracle,
} from "../../../typechain"
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
const fee = "0x00000000000000000000000000000000"
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
    pool = contracts1.pool
    pool2 = contracts2.pool
    signers = await ethers.getSigners()
    poolKeeper = contracts1.poolKeeper
    derivativeChainlinkOracle = contracts1.chainlinkOracle
    derivativeOracleWrapper = contracts1.oracleWrapper
    await token.approve(pool.address, mintAmount)
    await token.approve(pool2.address, mintAmount)
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
    })

    describe("Upkeep - Price execution", () => {
        let event: Result | undefined
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
        })
        it("should emit an event with the details", async () => {
            expect(event?.keeper).to.eq(signers[0].address)
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
