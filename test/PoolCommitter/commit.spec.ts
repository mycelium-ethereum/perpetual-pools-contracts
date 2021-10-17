import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    ERC20,
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
    getEventArgs,
    deployPoolAndTokenContracts,
    generateRandomAddress,
    timeout,
} from "../utilities"

import { ContractReceipt } from "ethers"
chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
// Update interval and frontrunning interval are in seconds
const updateInterval = 2000
const frontRunningInterval = 1000
const fee = DEFAULT_FEE
const leverage = 1

describe("LeveragedPool - commit", () => {
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let token: TestToken
    let library: PoolSwapLibrary
    let shortToken: ERC20
    let longToken: ERC20
    let poolCommitter: PoolCommitter
    let poolKeeper: PoolKeeper

    context("Create commit", () => {
        let receipt: ContractReceipt
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee
            )
            signers = result.signers
            pool = result.pool
            token = result.token
            library = result.library
            poolCommitter = result.poolCommitter
            poolKeeper = result.poolKeeper
            await token.approve(pool.address, amountCommitted)
            receipt = await (
                await poolCommitter.commit(SHORT_MINT, amountCommitted)
            ).wait()
        })
        it("should update the total commit amount", async () => {
            expect(
                (await poolCommitter.totalMostRecentCommit()).shortMintAmount
            ).to.equal(amountCommitted)
        })

        it("should emit an event with details of the commit", async () => {
            expect(getEventArgs(receipt, "CreateCommit")?.commitType).to.eq(
                SHORT_MINT
            )
            expect(getEventArgs(receipt, "CreateCommit")?.amount).to.eq(
                amountCommitted
            )
        })
    })

    context("Shadow balances", () => {
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee
            )
            signers = result.signers
            pool = result.pool
            token = result.token
            library = result.library
            poolCommitter = result.poolCommitter
            await token.approve(pool.address, amountMinted)
        })
        it("should update the pending short mint balance for short mint commits", async () => {
            expect(
                (await poolCommitter.totalMostRecentCommit()).shortMintAmount
            ).to.eq(0)
            await poolCommitter.commit([0], amountCommitted)
            expect(
                (await poolCommitter.totalMostRecentCommit()).shortMintAmount
            ).to.eq(amountCommitted)
        })

        it("should update the shadow short burn balance for short burn commits", async () => {
            await await poolCommitter.commit(SHORT_MINT, amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            await poolCommitter.claim(signers[0].address)

            expect(
                (await poolCommitter.totalMostRecentCommit()).shortBurnAmount
            ).to.eq(0)
            await poolCommitter.commit(SHORT_BURN, amountCommitted)
            expect(
                (await poolCommitter.totalMostRecentCommit()).shortBurnAmount
            ).to.eq(amountCommitted)
        })

        it("should update the shadow long mint balance for long mint commits", async () => {
            expect(
                (await poolCommitter.totalMostRecentCommit()).longMintAmount
            ).to.eq(0)
            await poolCommitter.commit(LONG_MINT, amountCommitted)

            expect(
                (await poolCommitter.totalMostRecentCommit()).longMintAmount
            ).to.eq(amountCommitted)
        })

        it("should update the shadow long burn balance for long burn commits", async () => {
            await poolCommitter.commit(LONG_MINT, amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            await poolCommitter.claim(signers[0].address)

            expect(
                (await poolCommitter.totalMostRecentCommit()).longBurnAmount
            ).to.eq(0)
            await poolCommitter.commit(LONG_BURN, amountCommitted)
            expect(
                (await poolCommitter.totalMostRecentCommit()).longBurnAmount
            ).to.eq(amountCommitted)
        })
    })

    // todo: Figure out where we want quote tokens to sit. Adjust these tests accordingly
    // currently it expects quote tokens to get transferred to the commiter, not the pool
    context("Token Transfers", () => {
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee
            )
            signers = result.signers
            pool = result.pool
            token = result.token
            library = result.library
            shortToken = result.shortToken
            longToken = result.longToken
            poolCommitter = result.poolCommitter

            await token.approve(pool.address, amountCommitted)
        })
        it("should not require a quote token transfer for short burn commits", async () => {
            const receipt = await (
                await poolCommitter.commit(SHORT_MINT, amountCommitted)
            ).wait()
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
            await poolCommitter.claim(signers[0].address)
            await poolCommitter.commit(SHORT_BURN, amountCommitted)

            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })
        it("should not require a quote token transfer for long burn commits", async () => {
            await await poolCommitter.commit(LONG_MINT, amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
            await poolCommitter.claim(signers[0].address)
            await poolCommitter.commit(LONG_BURN, amountCommitted)
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })
        it("should burn the user's short pair tokens for short burn commits", async () => {
            // Acquire pool tokens
            await await poolCommitter.commit(SHORT_MINT, amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            await poolCommitter.claim(signers[0].address)

            expect(await shortToken.balanceOf(signers[0].address)).to.eq(
                amountCommitted
            )
            await poolCommitter.claim(signers[0].address)
            await poolCommitter.commit(SHORT_BURN, amountCommitted)
            expect(await shortToken.balanceOf(signers[0].address)).to.eq(0)
        })
        it("should burn the user's long pair tokens for long burn commits", async () => {
            // Acquire pool tokens
            await await poolCommitter.commit(LONG_MINT, amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect(await longToken.balanceOf(signers[0].address)).to.eq(0)
            await poolCommitter.claim(signers[0].address)
            expect(await longToken.balanceOf(signers[0].address)).to.eq(
                amountCommitted
            )
            await poolCommitter.claim(signers[0].address)
            await poolCommitter.commit(LONG_BURN, amountCommitted)
            expect(await longToken.balanceOf(signers[0].address)).to.eq(0)
        })
        it("should transfer the user's quote tokens into the pool for long mint commits", async () => {
            expect(await token.balanceOf(pool.address)).to.eq(0)
            await poolCommitter.commit(LONG_MINT, amountCommitted)
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })

        it("should transfer the user's quote tokens into the pool for short mint commits", async () => {
            expect(await token.balanceOf(pool.address)).to.eq(0)
            await poolCommitter.commit(SHORT_MINT, amountCommitted)
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })
    })

    context("Commitments during frontRunningInterval", () => {
        let longFrontRunningInterval: number
        let longUpdateInterval: number
        beforeEach(async () => {
            longFrontRunningInterval = 1000
            longUpdateInterval = 1500
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                longFrontRunningInterval,
                longUpdateInterval,
                leverage,
                feeAddress,
                fee
            )
            signers = result.signers
            pool = result.pool
            token = result.token
            library = result.library
            shortToken = result.shortToken
            longToken = result.longToken
            poolCommitter = result.poolCommitter
            poolKeeper = result.poolKeeper

            await token.approve(pool.address, amountCommitted.mul(10))
        })
    })
})
