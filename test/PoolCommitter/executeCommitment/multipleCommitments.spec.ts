import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
    PoolKeeper,
} from "../../../types"

import {
    DEFAULT_FEE,
    DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
    DEFAULT_MIN_COMMIT_SIZE,
    POOL_CODE,
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
const updateInterval = 2
const frontRunningInterval = 1 // seconds
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

            const commit = await createCommit(
                poolCommitter,
                [2],
                amountCommitted
            )
            await shortToken.approve(pool.address, amountMinted)
            await timeout(2000)
            const signers = await ethers.getSigners()
            await pool.setKeeper(signers[0].address)

            await pool.poolUpkeep(lastPrice, lastPrice + 10)

            commits.push(
                await createCommit(poolCommitter, [2], amountCommitted)
            )
            commits.push(
                await createCommit(poolCommitter, [3], amountCommitted.div(2))
            )
        })
        it("should reduce the balances of the shadows pools involved", async () => {
            // Short mint and burn pools
            expect(
                await poolCommitter.shadowPools(commits[0].commitType)
            ).to.eq(amountCommitted)
            expect(
                await poolCommitter.shadowPools(commits[1].commitType)
            ).to.eq(amountCommitted.div(2))
            await timeout(2000)
            await pool.poolUpkeep(lastPrice, lastPrice + 10)

            expect(
                await poolCommitter.shadowPools(commits[0].commitType)
            ).to.eq(0)
            expect(
                await poolCommitter.shadowPools(commits[1].commitType)
            ).to.eq(0)
        })
        it("should adjust the balances of the live pools involved", async () => {
            expect(await pool.longBalance()).to.eq(amountCommitted)
            await timeout(2000)
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

            const commit = await createCommit(
                poolCommitter,
                [0],
                amountCommitted
            )

            await shortToken.approve(pool.address, amountMinted)
            await timeout(2000)

            await pool.poolUpkeep(lastPrice, 10)

            commits.push(
                await createCommit(poolCommitter, [0], amountCommitted)
            )
            commits.push(
                await createCommit(poolCommitter, [1], amountCommitted.div(2))
            )
        })
        it("should reduce the balances of the shadows pools involved", async () => {
            // Short mint and burn pools
            expect(
                await poolCommitter.shadowPools(commits[0].commitType)
            ).to.eq(amountCommitted)
            expect(
                await poolCommitter.shadowPools(commits[1].commitType)
            ).to.eq(amountCommitted.div(2))
            await timeout(2000)
            await pool.poolUpkeep(lastPrice, 10)

            expect(
                await poolCommitter.shadowPools(commits[0].commitType)
            ).to.eq(0)
            expect(
                await poolCommitter.shadowPools(commits[1].commitType)
            ).to.eq(0)
        })
        it("should adjust the balances of the live pools involved", async () => {
            expect(await pool.shortBalance()).to.eq(amountCommitted)
            await timeout(2000)
            await pool.poolUpkeep(lastPrice, 10)

            expect(await pool.shortBalance()).to.eq(
                amountCommitted.add(amountCommitted.div(2))
            )
        })
    })

    describe("Executing without any commitments during the frontRunningInterval", () => {
        const commits: CommitEventArgs[] | undefined = []
        let longFrontRunningInterval: number
        let longUpdateInterval: number
        let poolKeeper: PoolKeeper
        beforeEach(async () => {
            longFrontRunningInterval = 1000
            longUpdateInterval = 1500

            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                longFrontRunningInterval,
                longUpdateInterval,
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
            poolKeeper = result.poolKeeper

            // Approve an arbitrarily large amount
            await token.approve(pool.address, amountCommitted.mul(100))
        })
        it("should reset currentCommitQueueLength", async () => {
            await poolCommitter.commit(0, amountCommitted)
            await poolCommitter.commit(0, amountCommitted)
            await poolCommitter.commit(0, amountCommitted)

            // Three commits, so currentCommitQueueLength == 3
            expect(await poolCommitter.currentCommitQueueLength()).to.equal(3)
            await timeout((longUpdateInterval + 20) * 1000)

            // Should reset currentCommitQueueLength to 0
            await poolKeeper.performUpkeepSinglePool(pool.address)

            expect(await poolCommitter.currentCommitQueueLength()).to.equal(0)
        })
    })
})
