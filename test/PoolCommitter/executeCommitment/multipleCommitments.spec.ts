import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
} from "../../../types"

import {
    DEFAULT_FEE,
    DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
    DEFAULT_MIN_COMMIT_SIZE,
    LONG_BURN,
    LONG_MINT,
    POOL_CODE,
    SHORT_BURN,
    SHORT_MINT,
} from "../../constants"
import {
    deployPoolAndTokenContracts,
    getRandomInt,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
} from "../../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const lastPrice = getRandomInt(99999999, 1)
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 1

describe("LeveragedPool - executeCommitment:  Multiple commitments", () => {
    let token: TestToken
    let shortToken: ERC20
    let pool: LeveragedPool
    let library: PoolSwapLibrary
    let poolCommitter: PoolCommitter

    describe("Long mint->Long Burn", () => {
        const commits: CommitEventArgs[] | undefined = []
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                DEFAULT_MIN_COMMIT_SIZE,
                DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
                feeAddress,
                fee
            )
            pool = result.pool
            library = result.library
            token = result.token
            shortToken = result.shortToken
            poolCommitter = result.poolCommitter

            await token.approve(pool.address, amountMinted)

            await createCommit(poolCommitter, [2], amountCommitted)
            await shortToken.approve(pool.address, amountMinted)
            await timeout(updateInterval * 1000)
            const signers = await ethers.getSigners()
            await pool.setKeeper(signers[0].address)

            await pool.poolUpkeep(lastPrice, lastPrice + 10)

            await poolCommitter.claim(signers[0].address)

            commits.push(
                await createCommit(poolCommitter, LONG_MINT, amountCommitted)
            )
            commits.push(
                await createCommit(
                    poolCommitter,
                    LONG_BURN,
                    amountCommitted.div(2)
                )
            )
        })
        it("should reduce the balances of the shadows pools involved", async () => {
            // Short mint and burn pools
            expect(
                await (
                    await poolCommitter.totalMostRecentCommit()
                ).longMintAmount
            ).to.eq(amountCommitted)
            expect(
                await (
                    await poolCommitter.totalMostRecentCommit()
                ).longBurnAmount
            ).to.eq(amountCommitted.div(2))
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(lastPrice, lastPrice + 10)

            expect(
                await (
                    await poolCommitter.totalMostRecentCommit()
                ).longBurnAmount
            ).to.eq(0)
            expect(
                await (
                    await poolCommitter.totalMostRecentCommit()
                ).longMintAmount
            ).to.eq(0)
        })
        it("should adjust the balances of the live pools involved", async () => {
            expect(await pool.longBalance()).to.eq(amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(lastPrice, lastPrice + 10)

            expect(await pool.longBalance()).to.eq(
                amountCommitted.add(amountCommitted.div(2))
            )
        })
    })
    describe("Short mint->short burn", () => {
        const commits: CommitEventArgs[] | undefined = []
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                DEFAULT_MIN_COMMIT_SIZE,
                DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
                feeAddress,
                fee
            )
            pool = result.pool
            library = result.library
            token = result.token
            shortToken = result.shortToken
            poolCommitter = result.poolCommitter
            await pool.setKeeper(result.signers[0].address)

            await token.approve(pool.address, amountMinted)

            await createCommit(poolCommitter, SHORT_MINT, amountCommitted)

            await shortToken.approve(pool.address, amountMinted)
            await timeout(updateInterval * 1000)

            await pool.poolUpkeep(lastPrice, lastPrice)
            await poolCommitter.claim(result.signers[0].address)

            commits.push(
                await createCommit(poolCommitter, SHORT_MINT, amountCommitted)
            )
            commits.push(
                await createCommit(
                    poolCommitter,
                    SHORT_BURN,
                    amountCommitted.div(2)
                )
            )
        })
        it("should reduce the balances of the shadows pools involved", async () => {
            // Short mint and burn pools
            expect(
                (await poolCommitter.totalMostRecentCommit()).shortMintAmount
            ).to.eq(amountCommitted)
            expect(
                (await poolCommitter.totalMostRecentCommit()).shortBurnAmount
            ).to.eq(amountCommitted.div(2))
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(lastPrice, 10)

            expect(
                (await poolCommitter.totalMostRecentCommit()).shortMintAmount
            ).to.eq(0)
            expect(
                (await poolCommitter.totalMostRecentCommit()).shortBurnAmount
            ).to.eq(0)
        })
        it("should adjust the balances of the live pools involved", async () => {
            expect(await pool.shortBalance()).to.eq(amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(lastPrice, 10)

            expect(await pool.shortBalance()).to.eq(
                amountCommitted.mul(2).sub(amountCommitted.div(2))
            )
        })
    })
})
