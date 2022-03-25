import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    createCommit,
    deployPoolAndTokenContracts,
    generateRandomAddress,
    getEventArgs,
    performUpkeep,
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
    L2Encoder,
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
let l2Encoder: L2Encoder

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
    l2Encoder = contracts1.l2Encoder
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
    await createCommit(l2Encoder, poolCommitter, [2], mintAmount.div(2))
    await createCommit(l2Encoder, poolCommitter2, [2], mintAmount.div(2))
    await timeout(updateInterval * 1000 * 2)
    await pool.setKeeper(signers[0].address)
    await pool.poolUpkeep(9, 10)
    POOL1_ADDR = pool.address
    POOL2_ADDR = pool2.address
}

describe("PoolKeeper - performUpkeep: basic functionality", () => {
    let oldExecutionPrice: BigNumber
    let newExecutionPrice: BigNumber
    let newLastExecutionPrice: BigNumber
    let oldLastExecutionTime: BigNumber
    let newLastExecutionTime: BigNumber
    describe("Base cases", () => {
        beforeEach(setupHook)
        it("should not revert if performData is invalid", async () => {
            await pool.setKeeper(poolKeeper.address)
            await performUpkeep([POOL1_ADDR, POOL2_ADDR], poolKeeper, l2Encoder)
        })

        describe("Upkeep - Price execution", () => {
            let event: Result | undefined
            let upkeepEvent: Result | undefined
            let lastTime: BigNumber
            beforeEach(async () => {
                await setupHook()
                // process a few upkeeps
                lastTime = await pool.lastPriceTimestamp()
                await timeout(updateInterval * 1000 + 1000)
                await pool.setKeeper(poolKeeper.address)
                oldExecutionPrice = await poolKeeper.executionPrice(POOL1_ADDR)
                const result = await (
                    await performUpkeep(
                        [POOL1_ADDR, POOL2_ADDR],
                        poolKeeper,
                        l2Encoder
                    )
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
            beforeEach(async () => {
                // Check starting conditions
                await setupHook()
                // process a few upkeeps

                oldLastExecutionTime = await pool.lastPriceTimestamp()
                oldExecutionPrice = await poolKeeper.executionPrice(POOL1_ADDR)
                // delay and upkeep again
                await timeout(updateInterval * 1000 + 1000)

                newLastExecutionPrice = await poolKeeper.executionPrice(
                    POOL1_ADDR
                )
                await derivativeChainlinkOracle.setPrice("90000000")
                await pool.setKeeper(poolKeeper.address)
                await performUpkeep(
                    [POOL1_ADDR, POOL2_ADDR],
                    poolKeeper,
                    l2Encoder
                )
                newExecutionPrice = await poolKeeper.executionPrice(POOL1_ADDR)
                newLastExecutionTime = await pool.lastPriceTimestamp()
            })
            it("should clear the old round data", async () => {
                const price = await derivativeOracleWrapper.getPrice()
                expect(newLastExecutionTime.gt(oldLastExecutionTime)).to.equal(
                    true
                )
                expect(newExecutionPrice).to.be.lt(oldExecutionPrice)
                expect(newExecutionPrice).to.equal(price)
            })
            it("Should update the keeper's balance", async () => {
                await timeout(updateInterval * 1000 + 1000)
                const balanceBefore = await token.balanceOf(signers[0].address)
                const poolTokenBalanceBefore = await token.balanceOf(
                    pool.address
                )
                await performUpkeep(
                    [POOL1_ADDR, POOL2_ADDR],
                    poolKeeper,
                    l2Encoder
                )

                const balanceAfter = await token.balanceOf(signers[0].address)
                const poolTokenBalanceAfter = await token.balanceOf(
                    pool.address
                )
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
})
