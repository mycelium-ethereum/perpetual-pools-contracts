import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
    L2Encoder,
} from "../../../types"

import {
    DEFAULT_FEE,
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
    getCurrentTotalCommit,
    getNextTotalCommit,
    getNextUserCommit,
    getCurrentUserCommit,
} from "../../utilities"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

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

describe("PoolCommitter - executeCommitment:  Multiple commitments", () => {
    let token: TestToken
    let shortToken: ERC20
    let pool: LeveragedPool
    let library: PoolSwapLibrary
    let poolCommitter: PoolCommitter
    let signers: SignerWithAddress[]
    let l2Encoder: L2Encoder

    describe("Long mint->Long Burn", () => {
        const commits: CommitEventArgs[] | undefined = []
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee
            )
            l2Encoder = result.l2Encoder
            pool = result.pool
            library = result.library
            token = result.token
            shortToken = result.shortToken
            poolCommitter = result.poolCommitter
            signers = result.signers

            await token.approve(pool.address, amountMinted)

            await createCommit(l2Encoder, poolCommitter, [2], amountCommitted)
            await shortToken.approve(pool.address, amountMinted)
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)

            await pool.poolUpkeep(lastPrice, lastPrice + 10)

            await poolCommitter.claim(signers[0].address)

            commits.push(
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    LONG_MINT,
                    amountCommitted
                )
            )
            commits.push(
                await createCommit(
                    l2Encoder,
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
                    await getCurrentTotalCommit(poolCommitter)
                ).longMintSettlement
            ).to.eq(amountCommitted)
            expect(
                await (
                    await getCurrentTotalCommit(poolCommitter)
                ).longBurnPoolTokens
            ).to.eq(amountCommitted.div(2))
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(lastPrice, lastPrice + 10)

            expect(
                await (
                    await getCurrentTotalCommit(poolCommitter)
                ).longBurnPoolTokens
            ).to.eq(0)
            expect(
                await (
                    await getCurrentTotalCommit(poolCommitter)
                ).longMintSettlement
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

            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )

            await shortToken.approve(pool.address, amountMinted)
            await timeout(updateInterval * 1000)

            await pool.poolUpkeep(lastPrice, lastPrice)
            await poolCommitter.claim(result.signers[0].address)

            commits.push(
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_MINT,
                    amountCommitted
                )
            )
            commits.push(
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_BURN,
                    amountCommitted.div(2)
                )
            )
        })
        it("should reduce the balances of the shadows pools involved", async () => {
            // Short mint and burn pools
            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortMintSettlement
            ).to.eq(amountCommitted)
            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortBurnPoolTokens
            ).to.eq(amountCommitted.div(2))
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(lastPrice, 10)

            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortMintSettlement
            ).to.eq(0)
            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortBurnPoolTokens
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
    describe("Committing during front-running interval", () => {
        it("Executes all commits when commits are made during front-running interval and before, and executed at the same time", async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee
            )
            pool = result.pool
            library = result.library
            token = result.token
            shortToken = result.shortToken
            poolCommitter = result.poolCommitter
            await pool.setKeeper(result.signers[0].address)

            await token.approve(
                pool.address,
                ethers.utils.parseEther("9999999")
            )

            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )

            // totalMostRecentCommit, userMostRecentCommit should be populated.
            // totalNextIntervalCommit, userNextIntervalCommit should be empty.

            let totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )
            let userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            let totalNextIntervalCommit = await getNextTotalCommit(
                poolCommitter
            )
            let userNextIntervalCommit = await getNextUserCommit(
                signers[0].address,
                poolCommitter
            )

            expect(totalMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.longMintSettlement).to.equal(0)
            expect(userMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted
            )
            expect(userMostRecentCommit.longMintSettlement).to.equal(0)
            expect(totalNextIntervalCommit.shortMintSettlement).to.equal(0)
            expect(totalNextIntervalCommit.longMintSettlement).to.equal(0)
            expect(userNextIntervalCommit.shortMintSettlement).to.equal(0)
            expect(userNextIntervalCommit.longMintSettlement).to.equal(0)

            await timeout((updateInterval - frontRunningInterval / 2) * 1000)

            // Commit within frontrunning interval
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted.div(2)
            )

            // Now totalNextIntervalCommit should be populated, but totalMostRecentCommit should remain unchanged

            totalMostRecentCommit = await getCurrentTotalCommit(poolCommitter)
            userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            totalNextIntervalCommit = await getNextTotalCommit(poolCommitter)
            userNextIntervalCommit = await getNextUserCommit(
                signers[0].address,
                poolCommitter
            )

            expect(totalMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.longMintSettlement).to.equal(0)
            expect(userMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted
            )
            expect(userMostRecentCommit.longMintSettlement).to.equal(0)

            expect(totalNextIntervalCommit.shortMintSettlement).to.equal(0)
            expect(totalNextIntervalCommit.longMintSettlement).to.equal(
                amountCommitted.div(2)
            )
            expect(userNextIntervalCommit.shortMintSettlement).to.equal(0)
            expect(userNextIntervalCommit.longMintSettlement).to.equal(
                amountCommitted.div(2)
            )

            await timeout(updateInterval * 5 * 1000)

            await pool.poolUpkeep(lastPrice, lastPrice)

            await poolCommitter.updateAggregateBalance(
                result.signers[0].address
            )

            // Now, totalNextIntervalCommit should have been shifted into totalMostRecentCommit and same for userNextIntervalCommit

            totalMostRecentCommit = await getCurrentTotalCommit(poolCommitter)
            userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            totalNextIntervalCommit = await getNextTotalCommit(poolCommitter)
            userNextIntervalCommit = await getNextUserCommit(
                signers[0].address,
                poolCommitter
            )
            let userBalance = await poolCommitter.getAggregateBalance(
                result.signers[0].address
            )

            expect(totalMostRecentCommit.shortMintSettlement).to.equal(0)
            expect(totalMostRecentCommit.longMintSettlement).to.equal(0)
            expect(userMostRecentCommit.shortMintSettlement).to.equal(0)
            expect(userMostRecentCommit.longMintSettlement).to.equal(0)

            expect(totalNextIntervalCommit.shortMintSettlement).to.equal(0)
            expect(totalNextIntervalCommit.longMintSettlement).to.equal(0)
            expect(userNextIntervalCommit.shortMintSettlement).to.equal(0)
            expect(userNextIntervalCommit.longMintSettlement).to.equal(0)

            expect(userBalance.longTokens).to.equal(amountCommitted.div(2))
            expect(userBalance.shortTokens).to.equal(amountCommitted)
            expect(userBalance.settlementTokens).to.equal(0)

            const settlementTokenBalanceBefore = await result.token.balanceOf(
                result.signers[0].address
            )

            await poolCommitter.claim(result.signers[0].address)

            const longTokenBalance = await result.longToken.balanceOf(
                result.signers[0].address
            )
            const shortTokenBalance = await result.shortToken.balanceOf(
                result.signers[0].address
            )
            const settlementTokenBalanceAfter = await result.token.balanceOf(
                result.signers[0].address
            )

            expect(longTokenBalance).to.equal(amountCommitted.div(2))
            expect(shortTokenBalance).to.equal(amountCommitted)
            expect(settlementTokenBalanceAfter).to.equal(
                settlementTokenBalanceBefore
            )
        })

        it("Allows for commits before front-running interval to execute while maintaining storage of front-running commits", async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee
            )
            pool = result.pool
            library = result.library
            token = result.token
            shortToken = result.shortToken
            poolCommitter = result.poolCommitter
            await pool.setKeeper(result.signers[0].address)

            await token.approve(
                pool.address,
                ethers.utils.parseEther("9999999")
            )

            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )

            // totalMostRecentCommit, userMostRecentCommit should be populated.
            // totalNextIntervalCommit, userNextIntervalCommit should be empty.

            let totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )
            let userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            let totalNextIntervalCommit = await getNextTotalCommit(
                poolCommitter
            )
            let userNextIntervalCommit = await getNextUserCommit(
                signers[0].address,
                poolCommitter
            )

            expect(totalMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.longMintSettlement).to.equal(0)
            expect(userMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted
            )
            expect(userMostRecentCommit.longMintSettlement).to.equal(0)
            expect(totalNextIntervalCommit.shortMintSettlement).to.equal(0)
            expect(totalNextIntervalCommit.longMintSettlement).to.equal(0)
            expect(userNextIntervalCommit.shortMintSettlement).to.equal(0)
            expect(userNextIntervalCommit.longMintSettlement).to.equal(0)

            await timeout((updateInterval - frontRunningInterval / 2) * 1000)

            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted.div(2)
            )

            // Now totalNextIntervalCommit should be populated, but totalMostRecentCommit should remain unchanged

            totalMostRecentCommit = await getCurrentTotalCommit(poolCommitter)
            userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            totalNextIntervalCommit = await getNextTotalCommit(poolCommitter)
            userNextIntervalCommit = await getNextUserCommit(
                signers[0].address,
                poolCommitter
            )

            expect(totalMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.longMintSettlement).to.equal(0)
            expect(userMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted
            )
            expect(userMostRecentCommit.longMintSettlement).to.equal(0)

            expect(totalNextIntervalCommit.shortMintSettlement).to.equal(0)
            expect(totalNextIntervalCommit.longMintSettlement).to.equal(
                amountCommitted.div(2)
            )
            expect(userNextIntervalCommit.shortMintSettlement).to.equal(0)
            expect(userNextIntervalCommit.longMintSettlement).to.equal(
                amountCommitted.div(2)
            )

            await timeout(updateInterval * 1000)

            await pool.poolUpkeep(lastPrice, lastPrice)

            await poolCommitter.updateAggregateBalance(
                result.signers[0].address
            )

            // Now, totalNextIntervalCommit should have been shifted into totalMostRecentCommit and same for userNextIntervalCommit

            totalMostRecentCommit = await getCurrentTotalCommit(poolCommitter)
            userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            totalNextIntervalCommit = await getNextTotalCommit(poolCommitter)
            userNextIntervalCommit = await getNextUserCommit(
                signers[0].address,
                poolCommitter
            )
            let userBalance = await poolCommitter.getAggregateBalance(
                result.signers[0].address
            )

            expect(totalMostRecentCommit.shortMintSettlement).to.equal(0)
            expect(totalMostRecentCommit.longMintSettlement).to.equal(
                amountCommitted.div(2)
            )
            expect(userMostRecentCommit.shortMintSettlement).to.equal(0)
            expect(userMostRecentCommit.longMintSettlement).to.equal(
                amountCommitted.div(2)
            )

            expect(totalNextIntervalCommit.shortMintSettlement).to.equal(0)
            expect(totalNextIntervalCommit.longMintSettlement).to.equal(0)
            expect(userNextIntervalCommit.shortMintSettlement).to.equal(0)
            expect(userNextIntervalCommit.longMintSettlement).to.equal(0)

            expect(userBalance.longTokens).to.equal(0)
            expect(userBalance.shortTokens).to.equal(amountCommitted)
            expect(userBalance.settlementTokens).to.equal(0)

            await timeout(updateInterval * 1000)

            await pool.poolUpkeep(lastPrice, lastPrice)

            const settlementTokenBalanceBefore = await result.token.balanceOf(
                result.signers[0].address
            )

            await poolCommitter.claim(result.signers[0].address)

            const longTokenBalance = await result.longToken.balanceOf(
                result.signers[0].address
            )
            const shortTokenBalance = await result.shortToken.balanceOf(
                result.signers[0].address
            )
            const settlementTokenBalanceAfter = await result.token.balanceOf(
                result.signers[0].address
            )

            expect(longTokenBalance).to.equal(amountCommitted.div(2))
            expect(shortTokenBalance).to.equal(amountCommitted)
            expect(settlementTokenBalanceAfter).to.equal(
                settlementTokenBalanceBefore
            )
        })
    })
})
