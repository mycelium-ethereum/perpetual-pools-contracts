import { ethers } from "hardhat"
import chai from "chai"
const { expect } = chai
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
    InvariantCheck,
    LeveragedPoolBalanceDrainMock,
    PoolKeeper,
} from "../../types"

import { POOL_CODE, DEFAULT_FEE, LONG_MINT, SHORT_MINT } from "../constants"
import {
    getRandomInt,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    deployMockPool,
    timeout,
} from "../utilities"
chai.use(chaiAsPromised)

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 1

describe("InvariantCheck - balanceInvariant", () => {
    let poolCommitter: PoolCommitter
    let token: TestToken
    let invariantCheck: InvariantCheck
    let shortToken: ERC20
    let longToken: ERC20
    let pool: LeveragedPoolBalanceDrainMock
    let poolKeeper: PoolKeeper
    let library: PoolSwapLibrary

    const commits: CommitEventArgs[] | undefined = []
    beforeEach(async () => {
        const result = await deployMockPool(
            POOL_CODE,
            frontRunningInterval,
            updateInterval,
            leverage,
            feeAddress,
            fee
        )
        pool = result.pool
        poolKeeper = result.poolKeeper
        library = result.library
        poolCommitter = result.poolCommitter
        invariantCheck = result.invariantCheck

        token = result.token
        shortToken = result.shortToken
        longToken = result.longToken

        await token.approve(pool.address, amountMinted)

        // Long mint commit
        await createCommit(poolCommitter, LONG_MINT, amountCommitted)
        // short mint commit
        await createCommit(poolCommitter, SHORT_MINT, amountCommitted)
    })

    context("Pool funds getting drained", async () => {
        it("Pauses contracts", async () => {
            await pool.drainPool(1)
            const shortMintAmountBefore = (
                await poolCommitter.totalMostRecentCommit()
            ).shortMintAmount
            const balanceBefore = await token.balanceOf(pool.address)
            const longMintAmountBefore = (
                await poolCommitter.totalMostRecentCommit()
            ).longMintAmount

            // Creating a commit does not work
            await createCommit(poolCommitter, SHORT_MINT, amountCommitted)
            let shortMintAmountAfter = (
                await poolCommitter.totalMostRecentCommit()
            ).shortMintAmount
            let balanceAfter = await token.balanceOf(pool.address)
            expect(shortMintAmountAfter).to.equal(shortMintAmountBefore)
            expect(balanceAfter).to.equal(balanceBefore)

            // Performing upkeep does not work
            await timeout(updateInterval * 2000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            shortMintAmountAfter = (await poolCommitter.totalMostRecentCommit())
                .shortMintAmount
            balanceAfter = await token.balanceOf(pool.address)
            let longMintAmountAfter = (
                await poolCommitter.totalMostRecentCommit()
            ).longMintAmount
            expect(shortMintAmountAfter).to.equal(shortMintAmountBefore)
            expect(longMintAmountAfter).to.equal(longMintAmountBefore)
            expect(balanceAfter).to.equal(balanceBefore)
        })
        it("Doesn't allow the contracts to get unpaused (Needs governance to unpause)", async () => {
            await pool.drainPool(1)
            await invariantCheck.checkInvariants(pool.address)
            expect(await pool.paused()).to.equal(true)
            expect(await poolCommitter.paused()).to.equal(true)
            await token.transfer(pool.address, 123)
            await invariantCheck.checkInvariants(pool.address)
            expect(await pool.paused()).to.equal(true)
            expect(await poolCommitter.paused()).to.equal(true)
        })
        it("Once paused, can manually unpause as governance", async () => {
            await pool.drainPool(1)
            await invariantCheck.checkInvariants(pool.address)
            expect(await pool.paused()).to.equal(true)
            expect(await poolCommitter.paused()).to.equal(true)
            await pool.unpause()
            await poolCommitter.unpause()
            expect(await pool.paused()).to.equal(false)
            expect(await poolCommitter.paused()).to.equal(false)
        })
    })
})
