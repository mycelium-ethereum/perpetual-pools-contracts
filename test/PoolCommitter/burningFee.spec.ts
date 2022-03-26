import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    ERC20,
    L2Encoder,
    LeveragedPool,
    PoolCommitter,
    PoolKeeper,
    PoolSwapLibrary,
    TestToken,
} from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    DEFAULT_FEE,
    LONG_BURN,
    LONG_MINT,
    POOL_CODE,
    SHORT_BURN,
    SHORT_MINT,
} from "../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    timeout,
    getCurrentTotalCommit,
    getCurrentUserCommit,
    createCommit,
} from "../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const feeAddress = generateRandomAddress()
// Update interval and frontrunning interval are in seconds
const updateInterval = 2000
const frontRunningInterval = 1000
const fee = DEFAULT_FEE
const leverage = 1
const burnFee = ethers.utils.parseEther("0.01")
const burnFeeReciprocal = ethers.BigNumber.from("100")
const feeTaken = amountCommitted.div(burnFeeReciprocal) // amountCommitted / 100

describe("PoolCommitter - Burn commit with burn fee", () => {
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let token: TestToken
    let library: PoolSwapLibrary
    let shortToken: ERC20
    let longToken: ERC20
    let poolCommitter: PoolCommitter
    let poolKeeper: PoolKeeper
    let l2Encoder: L2Encoder

    context("Create SHORT_BURN commit", () => {
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee,
                0,
                burnFee
            )
            signers = result.signers
            pool = result.pool
            token = result.token
            library = result.library
            poolCommitter = result.poolCommitter
            poolKeeper = result.poolKeeper
            shortToken = result.shortToken
            l2Encoder = result.l2Encoder
            await poolKeeper.setGasPrice("0")
            await token.approve(pool.address, amountCommitted)
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_BURN,
                amountCommitted,
                true
            )
        })
        it("burns all pool tokens", async () => {
            expect(await shortToken.totalSupply()).to.equal(0)
        })

        it("stores the amount committed", async () => {
            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortBurnPoolTokens
            ).to.equal(amountCommitted)
            expect(
                (await getCurrentUserCommit(signers[0].address, poolCommitter))
                    .shortBurnPoolTokens
            ).to.equal(amountCommitted)
        })

        it("Updates aggregate balance", async () => {
            await timeout(updateInterval * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            expect(
                (await poolCommitter.getAggregateBalance(signers[0].address))
                    .shortTokens
            ).to.equal(0)
            expect(
                (await poolCommitter.getAggregateBalance(signers[0].address))
                    .settlementTokens
            ).to.equal(amountCommitted.sub(feeTaken))
        })

        it("Updates wallet balance properly on claim", async () => {
            await timeout(updateInterval * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            const tokenBalBefore = await token.balanceOf(signers[0].address)
            await poolCommitter.claim(signers[0].address)
            const tokenBalAfter = await token.balanceOf(signers[0].address)

            expect(await shortToken.balanceOf(signers[0].address)).to.equal(0)
            expect(tokenBalAfter.sub(tokenBalBefore)).to.equal(
                amountCommitted.sub(feeTaken)
            )
        })

        it("Adds to shortBalance on claim", async () => {
            await timeout((updateInterval + 0) * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            await poolCommitter.claim(signers[0].address)
            expect(await pool.shortBalance()).to.equal(feeTaken)
        })
    })

    context("Setting Burn fee", async () => {
        context("Burn fee too high", async () => {
            it("reverts", async () => {
                const result = await deployPoolAndTokenContracts(
                    POOL_CODE,
                    frontRunningInterval,
                    updateInterval,
                    leverage,
                    feeAddress,
                    fee,
                    0
                )
                const burningFee = ethers.utils.parseEther("0.11")
                await expect(
                    result.poolCommitter.setBurningFee(burningFee)
                ).to.be.revertedWith("Burning fee >= 10%")
            })
        })
        it("Updates burn fee", async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee,
                0
            )
            const burningFee = ethers.utils.parseEther("0.09")
            await result.poolCommitter.setBurningFee(burningFee)
            const resultantBurningFee =
                await result.library.convertDecimalToUInt(
                    await result.poolCommitter.burningFee()
                )
            expect(resultantBurningFee).to.equal(burningFee)
        })
    })

    context("Create LONG_BURN commit", async () => {
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee,
                0,
                burnFee
            )
            signers = result.signers
            pool = result.pool
            token = result.token
            library = result.library
            poolCommitter = result.poolCommitter
            poolKeeper = result.poolKeeper
            longToken = result.longToken
            l2Encoder = result.l2Encoder
            await poolKeeper.setGasPrice("0")
            await token.approve(pool.address, amountCommitted)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_BURN,
                amountCommitted,
                true
            )
        })
        it("burns all pool tokens", async () => {
            expect(await longToken.totalSupply()).to.equal(0)
        })

        it("stores the amount committed", async () => {
            expect(
                (await getCurrentTotalCommit(poolCommitter)).longBurnPoolTokens
            ).to.equal(amountCommitted)
            expect(
                (await getCurrentUserCommit(signers[0].address, poolCommitter))
                    .longBurnPoolTokens
            ).to.equal(amountCommitted)
        })

        it("Updates aggregate balance", async () => {
            await timeout(updateInterval * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            expect(
                (await poolCommitter.getAggregateBalance(signers[0].address))
                    .longTokens
            ).to.equal(0)
            expect(
                (await poolCommitter.getAggregateBalance(signers[0].address))
                    .settlementTokens
            ).to.equal(amountCommitted.sub(feeTaken))
        })

        it("Updates wallet balance properly on claim", async () => {
            await timeout(updateInterval * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            await poolCommitter.claim(signers[0].address)
            expect(await longToken.balanceOf(signers[0].address)).to.equal(0)
        })
    })
})
