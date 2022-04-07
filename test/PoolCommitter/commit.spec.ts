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
    LONG_BURN_THEN_MINT,
    LONG_MINT,
    POOL_CODE,
    SHORT_BURN,
    SHORT_BURN_THEN_MINT,
    SHORT_MINT,
} from "../constants"
import {
    getEventArgs,
    deployPoolAndTokenContracts,
    generateRandomAddress,
    timeout,
    getCurrentTotalCommit,
    getCurrentUserCommit,
    createCommit,
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

describe("PoolCommitter - commit", () => {
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let token: TestToken
    let library: PoolSwapLibrary
    let shortToken: ERC20
    let longToken: ERC20
    let poolCommitter: PoolCommitter
    let poolKeeper: PoolKeeper
    let l2Encoder: L2Encoder

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
            l2Encoder = result.l2Encoder
            signers = result.signers
            pool = result.pool
            token = result.token
            library = result.library
            poolCommitter = result.poolCommitter
            poolKeeper = result.poolKeeper
            await token.approve(pool.address, amountCommitted)
            receipt = (
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_MINT,
                    amountCommitted,
                    false
                )
            ).receipt
        })
        it("should update the total commit amount", async () => {
            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortMintSettlement
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
                (await getCurrentTotalCommit(poolCommitter)).shortMintSettlement
            ).to.eq(0)
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )
            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortMintSettlement
            ).to.eq(amountCommitted)
        })

        it("should update the shadow short burn balance for short burn commits", async () => {
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            await poolCommitter.claim(signers[0].address)

            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortBurnPoolTokens
            ).to.eq(0)
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_BURN,
                amountCommitted
            )
            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortBurnPoolTokens
            ).to.eq(amountCommitted)
        })

        it("should update the shadow long mint balance for long mint commits", async () => {
            expect(
                (await getCurrentTotalCommit(poolCommitter)).longMintSettlement
            ).to.eq(0)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )

            expect(
                (await getCurrentTotalCommit(poolCommitter)).longMintSettlement
            ).to.eq(amountCommitted)
        })

        it("should update the shadow long burn balance for long burn commits", async () => {
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            await poolCommitter.claim(signers[0].address)

            expect(
                (await getCurrentTotalCommit(poolCommitter)).longBurnPoolTokens
            ).to.eq(0)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_BURN,
                amountCommitted
            )
            expect(
                (await getCurrentTotalCommit(poolCommitter)).longBurnPoolTokens
            ).to.eq(amountCommitted)
        })
    })

    context("Committing SHORT_BURN using aggregate balance", () => {
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
            l2Encoder = result.l2Encoder
            poolCommitter = result.poolCommitter

            await token.approve(pool.address, amountCommitted.mul(999))
            await pool.setKeeper(signers[0].address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Should appropriately set values", async () => {
            // Commit using the balance in the contracts, which we just committed.
            const shortTokenSupplyBefore = await shortToken.totalSupply()
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_BURN,
                amountCommitted,
                true
            )
            const shortTokenSupplyAfter = await shortToken.totalSupply()

            const userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            const totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )

            expect(shortTokenSupplyAfter).to.equal(
                shortTokenSupplyBefore.sub(amountCommitted)
            ) // Supply decreases
            // Commitment storage updates
            expect(userMostRecentCommit.shortBurnPoolTokens).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.shortBurnPoolTokens).to.equal(
                amountCommitted
            )
        })

        it("Should not allow for too many commitments (that bring amount over a user's balance)", async () => {
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_BURN,
                amountCommitted,
                true
            )
            await expect(
                createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_BURN,
                    amountCommitted,
                    true
                )
            ).to.be.revertedWith("Insufficient pool tokens")
        })

        it("Should not allow commits that are too large", async () => {
            await expect(
                createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_BURN,
                    amountCommitted.mul(300),
                    true
                )
            ).to.be.revertedWith("Insufficient pool tokens")
        })

        it("Should allow for a combination of short_burn commits from wallet and aggregate balance", async () => {
            await poolCommitter.claim(signers[0].address)

            /* SHORT_MINT COMMIT */
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            /* UPKEEP */
            await pool.poolUpkeep(1, 1)

            const shortTokenSupplyBefore = await shortToken.totalSupply()

            /* SHORT_BURN COMMIT */
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_BURN,
                amountCommitted,
                true
            )

            const userCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )

            /* SHORT_BURN COMMIT */
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_BURN,
                amountCommitted
            )

            const shortTokenSupplyAfter = await shortToken.totalSupply()

            const userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            const totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )

            // Supply decreases
            expect(shortTokenSupplyAfter).to.equal(
                shortTokenSupplyBefore.sub(amountCommitted).sub(amountCommitted)
            )

            expect(userMostRecentCommit.shortBurnPoolTokens).to.equal(
                amountCommitted.mul(2)
            )
            expect(totalMostRecentCommit.shortBurnPoolTokens).to.equal(
                amountCommitted.mul(2)
            )

            await timeout(updateInterval * 1000)
            /* UPKEEP */
            await pool.poolUpkeep(1, 1)

            const balanceBefore = await token.balanceOf(signers[0].address)
            /* CLAIM */
            await poolCommitter.claim(signers[0].address)

            const balance = await token.balanceOf(signers[0].address)

            // User has committed short mint twice, and burnt twice as well
            expect(balance.sub(balanceBefore)).to.equal(amountCommitted.mul(2))
        })
    })

    context("Committing SHORT_MINT using aggregate balance", () => {
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
            l2Encoder = result.l2Encoder

            await token.approve(pool.address, amountCommitted.mul(999))
            await pool.setKeeper(signers[0].address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
            await poolCommitter.claim(signers[0].address)
            // Burn, so you have settlement tokens in your aggregate balance
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_BURN,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Should appropriately set values", async () => {
            // Commit using the balance in the contracts, which we just committed.
            const shortTokenSupplyBefore = await shortToken.totalSupply()
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted,
                true
            )
            const shortTokenSupplyAfter = await shortToken.totalSupply()

            const userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            const totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )

            expect(shortTokenSupplyAfter).to.equal(shortTokenSupplyBefore) // Supply stays same
            // Balance storage updates
            const settlementTokens = (
                await poolCommitter.getAggregateBalance(signers[0].address)
            ).settlementTokens
            expect(settlementTokens).to.equal(0)

            expect(userMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted
            )
        })

        it("Should not allow for too many commitments (that bring amount over a user's balance)", async () => {
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted,
                true
            )
            await expect(
                createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_MINT,
                    amountCommitted,
                    true
                )
            ).be.rejected // Can't figure out how to get the "overflow" error message to be used in chai assertions
        })

        it("Should not allow commits that are too large", async () => {
            await expect(
                createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_MINT,
                    amountCommitted.mul(300),
                    true
                )
            ).be.rejected // Can't figure out how to get the "overflow" error message to be used in chai assertions
        })

        it("Should allow for a combination of short_mint commits from wallet and aggregate balance", async () => {
            const shortTokenSupplyBefore = await shortToken.totalSupply()

            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted,
                true
            )
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )

            const shortTokenSupplyAfter = await shortToken.totalSupply()

            const userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            const totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )

            expect(shortTokenSupplyAfter).to.equal(shortTokenSupplyBefore) // Supply decreases
            // Balance storage updates
            const settlementTokens = (
                await poolCommitter.getAggregateBalance(signers[0].address)
            ).settlementTokens
            expect(settlementTokens).to.equal(0)

            expect(userMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted.mul(2)
            )
            expect(totalMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted.mul(2)
            )

            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)

            const balanceBefore = await shortToken.balanceOf(signers[0].address)
            await poolCommitter.claim(signers[0].address)

            const balance = await shortToken.balanceOf(signers[0].address)

            // User has committed short mint twice, and burnt twice as well
            expect(balance.sub(balanceBefore)).to.equal(amountCommitted.mul(2))
        })
    })

    context("Committing LONG_BURN using aggregate balance", () => {
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

            await token.approve(pool.address, amountCommitted.mul(999))
            await pool.setKeeper(signers[0].address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Should appropriately set values", async () => {
            // Commit using the balance in the contracts, which we just committed.
            const longTokenSupplyBefore = await longToken.totalSupply()
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_BURN,
                amountCommitted,
                true
            )
            const longTokenSupplyAfter = await longToken.totalSupply()

            const userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            const totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )

            expect(longTokenSupplyAfter).to.equal(
                longTokenSupplyBefore.sub(amountCommitted)
            ) // Supply decreases
            // Commitment storage updates
            expect(userMostRecentCommit.longBurnPoolTokens).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.longBurnPoolTokens).to.equal(
                amountCommitted
            )
        })

        it("Should not allow for too many commitments (that bring amount over a user's balance)", async () => {
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_BURN,
                amountCommitted,
                true
            )
            await expect(
                createCommit(
                    l2Encoder,
                    poolCommitter,
                    LONG_BURN,
                    amountCommitted,
                    true
                )
            ).to.be.revertedWith("Insufficient pool tokens")
        })

        it("Should not allow commits that are too large", async () => {
            await expect(
                createCommit(
                    l2Encoder,
                    poolCommitter,
                    LONG_BURN,
                    amountCommitted.mul(300),
                    true
                )
            ).to.be.revertedWith("Insufficient pool tokens")
        })

        it("Should allow for a combination of long_burn commits from wallet and aggregate balance", async () => {
            await poolCommitter.claim(signers[0].address)

            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)

            const longTokenSupplyBefore = await longToken.totalSupply()

            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_BURN,
                amountCommitted,
                true
            )

            const userCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )

            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_BURN,
                amountCommitted
            )

            const longTokenSupplyAfter = await longToken.totalSupply()

            // Supply decreases
            expect(longTokenSupplyAfter).to.equal(
                longTokenSupplyBefore.sub(amountCommitted).sub(amountCommitted)
            )

            const userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            const totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )

            expect(userMostRecentCommit.longBurnPoolTokens).to.equal(
                amountCommitted.mul(2)
            )
            expect(totalMostRecentCommit.longBurnPoolTokens).to.equal(
                amountCommitted.mul(2)
            )

            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)

            const balanceBefore = await token.balanceOf(signers[0].address)
            await poolCommitter.claim(signers[0].address)

            const balance = await token.balanceOf(signers[0].address)

            // User has committed long mint twice, and burnt twice, as well
            expect(balance.sub(balanceBefore)).to.equal(amountCommitted.mul(2))
        })
    })

    context("Committing LONG_MINT using aggregate balance", () => {
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
            l2Encoder = result.l2Encoder

            await token.approve(pool.address, amountCommitted.mul(999))
            await pool.setKeeper(signers[0].address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
            await poolCommitter.claim(signers[0].address)
            // Burn, so you have settlement tokens in your aggregate balance
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_BURN,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Should appropriately set values", async () => {
            // Commit using the balance in the contracts, which we just committed.
            const longTokenSupplyBefore = await longToken.totalSupply()
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted,
                true
            )
            const longTokenSupplyAfter = await longToken.totalSupply()

            const userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            const totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )

            expect(longTokenSupplyAfter).to.equal(longTokenSupplyBefore) // Supply stays same
            // Commitment storage updates
            const settlementTokens = (
                await poolCommitter.getAggregateBalance(signers[0].address)
            ).settlementTokens
            expect(settlementTokens).to.equal(0)
            expect(userMostRecentCommit.longMintSettlement).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.longMintSettlement).to.equal(
                amountCommitted
            )
        })

        it("Should not allow for too many commitments (that bring amount over a user's balance)", async () => {
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted,
                true
            )
            await expect(
                createCommit(
                    l2Encoder,
                    poolCommitter,
                    LONG_MINT,
                    amountCommitted,
                    true
                )
            ).be.rejected // Can't figure out how to get the "overflow" error message to be used in chai assertions
        })

        it("Should not allow commits that are too large", async () => {
            await expect(
                createCommit(
                    l2Encoder,
                    poolCommitter,
                    LONG_MINT,
                    amountCommitted.mul(300),
                    true
                )
            ).be.rejected // Can't figure out how to get the "overflow" error message to be used in chai assertions
        })

        it("Long mint from aggregate balance reduces settlement token amount in balance", async () => {
            const longTokenSupplyBefore = await longToken.totalSupply()

            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted,
                true
            )

            // Balance storage updates
            const settlementTokens = (
                await poolCommitter.getAggregateBalance(signers[0].address)
            ).settlementTokens
            expect(settlementTokens).to.equal(0)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )

            const longTokenSupplyAfter = await longToken.totalSupply()

            const userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            const totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )

            expect(longTokenSupplyAfter).to.equal(longTokenSupplyBefore) // Supply decreases
            expect(userMostRecentCommit.longMintSettlement).to.equal(
                amountCommitted.mul(2)
            )
            expect(totalMostRecentCommit.longMintSettlement).to.equal(
                amountCommitted.mul(2)
            )

            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)

            const balanceBefore = await longToken.balanceOf(signers[0].address)
            await poolCommitter.claim(signers[0].address)

            const balance = await longToken.balanceOf(signers[0].address)

            // User has committed short mint twice, and burnt twice as well
            expect(balance.sub(balanceBefore)).to.equal(amountCommitted.mul(2))
        })

        it("Should allow for a combination of long_mint commits from wallet and aggregate balance", async () => {
            const longTokenSupplyBefore = await longToken.totalSupply()

            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted,
                true
            )

            const userCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )

            // Balance storage updates
            const settlementTokens = (
                await poolCommitter.getAggregateBalance(signers[0].address)
            ).settlementTokens
            expect(settlementTokens).to.equal(0)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )

            const longTokenSupplyAfter = await longToken.totalSupply()

            const userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            const totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )

            expect(longTokenSupplyAfter).to.equal(longTokenSupplyBefore) // Supply decreases
            expect(userMostRecentCommit.longMintSettlement).to.equal(
                amountCommitted.mul(2)
            )
            expect(totalMostRecentCommit.longMintSettlement).to.equal(
                amountCommitted.mul(2)
            )

            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)

            const balanceBefore = await longToken.balanceOf(signers[0].address)
            await poolCommitter.claim(signers[0].address)

            const balance = await longToken.balanceOf(signers[0].address)

            // User has committed short mint twice, and burnt twice as well
            expect(balance.sub(balanceBefore)).to.equal(amountCommitted.mul(2))
        })
    })

    context("Combination of different commit types (more e2e)", () => {
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

            await token.approve(pool.address, amountCommitted.mul(999))
            await pool.setKeeper(signers[0].address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
            await poolCommitter.claim(signers[0].address)
            // Burn, so you have settlement tokens in your aggregate balance
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_BURN,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Operates as intended", async () => {
            const longTokenSupplyBefore = await longToken.totalSupply()

            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted,
                true
            )
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )

            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )

            const longTokenSupplyAfter = await longToken.totalSupply()

            const userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            const totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )

            expect(longTokenSupplyAfter).to.equal(longTokenSupplyBefore) // Supply decreases
            // Balance storage updates
            const settlementTokens = (
                await poolCommitter.getAggregateBalance(signers[0].address)
            ).settlementTokens
            expect(settlementTokens).to.equal(0)
            expect(userMostRecentCommit.longMintSettlement).to.equal(
                amountCommitted.mul(2)
            )
            expect(totalMostRecentCommit.longMintSettlement).to.equal(
                amountCommitted.mul(2)
            )

            expect(userMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.shortMintSettlement).to.equal(
                amountCommitted
            )

            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)

            const balanceBefore = await longToken.balanceOf(signers[0].address)

            await expect(
                createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_BURN,
                    amountCommitted
                )
            ).to.be.revertedWith("ERC20: burn amount exceeds balance")

            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_BURN,
                amountCommitted.div(2),
                true
            )

            // Go into frontRunningInterval
            await timeout((updateInterval - frontRunningInterval / 2) * 1000)

            await poolCommitter.claim(signers[0].address)

            await expect(
                createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_BURN,
                    amountCommitted.div(2),
                    true
                )
            ).to.be.revertedWith("Insufficient pool tokens")

            const longBalance = await longToken.balanceOf(signers[0].address)
            const shortBalance = await shortToken.balanceOf(signers[0].address)

            // User has committed long mint twice, and burnt twice as well
            expect(longBalance.sub(balanceBefore)).to.equal(
                amountCommitted.mul(2)
            )
            // User has minted amountCommitted, and burned amountCommitted/2
            expect(shortBalance).to.equal(amountCommitted.div(2))
        })
    })

    context(
        "Long Burning then minting in one commit, from aggregate balance",
        () => {
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
                l2Encoder = result.l2Encoder

                await token.approve(pool.address, amountCommitted.mul(999))
                await pool.setKeeper(signers[0].address)
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    LONG_MINT,
                    amountCommitted
                )
                await timeout(updateInterval * 1000)
                await pool.poolUpkeep(1, 1)
            })

            it("Should appropriately set values", async () => {
                // Commit using the balance in the contracts, which we just committed.
                const longTokenSupplyBefore = await longToken.totalSupply()
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    LONG_BURN_THEN_MINT,
                    amountCommitted,
                    true
                )
                const longTokenSupplyAfter = await longToken.totalSupply()

                const userMostRecentCommit = await getCurrentUserCommit(
                    signers[0].address,
                    poolCommitter
                )
                const totalMostRecentCommit = await getCurrentTotalCommit(
                    poolCommitter
                )

                // Supply decreases
                expect(longTokenSupplyAfter).to.equal(
                    longTokenSupplyBefore.sub(amountCommitted)
                )
                // Commitment storage updates
                expect(
                    userMostRecentCommit.longBurnShortMintPoolTokens
                ).to.equal(amountCommitted)
                expect(totalMostRecentCommit.longBurnPoolTokens).to.equal(0)
                expect(
                    totalMostRecentCommit.longBurnShortMintPoolTokens
                ).to.equal(amountCommitted)
            })

            context("Invalid commitments", () => {
                it("Should revert if you are attempting to LONG_BURN_THEN_MINT duplicate times (from aggregate balance)", async () => {
                    // Commit using the balance in the wallet, which we just committed.
                    await createCommit(
                        l2Encoder,
                        poolCommitter,
                        LONG_BURN_THEN_MINT,
                        amountCommitted,
                        true
                    )
                    await expect(
                        createCommit(
                            l2Encoder,
                            poolCommitter,
                            LONG_BURN_THEN_MINT,
                            amountCommitted,
                            true
                        )
                    ).to.be.revertedWith("Insufficient pool tokens")
                })

                it("Should revert if you are attempting to LONG_BURN_THEN_MINT duplicate times (from aggregate balance)", async () => {
                    // Commit using the balance in the contracts, which we just committed.
                    await createCommit(
                        l2Encoder,
                        poolCommitter,
                        LONG_BURN_THEN_MINT,
                        amountCommitted,
                        true
                    )
                    await expect(
                        createCommit(
                            l2Encoder,
                            poolCommitter,
                            LONG_BURN_THEN_MINT,
                            amountCommitted,
                            true
                        )
                    ).to.be.revertedWith("Insufficient pool tokens")
                })

                it("Should revert if you are attempting to LONG_BURN_THEN_MINT too many tokens (from wallet)", async () => {
                    // Commit using the balance in the wallet, which we just committed.
                    await expect(
                        createCommit(
                            l2Encoder,
                            poolCommitter,
                            LONG_BURN_THEN_MINT,
                            amountCommitted.add(1),
                            true
                        )
                    ).to.be.revertedWith("Insufficient pool tokens")
                })

                it("Should revert if you are attempting to LONG_BURN_THEN_MINT too many tokens (from aggregate balance)", async () => {
                    // Commit using the balance in the contracts, which we just committed.
                    await expect(
                        createCommit(
                            l2Encoder,
                            poolCommitter,
                            LONG_BURN_THEN_MINT,
                            amountCommitted.add(1),
                            true
                        )
                    ).to.be.revertedWith("Insufficient pool tokens")
                })
            })

            context("Valid execution", () => {
                context("Different prices per token", () => {
                    context(
                        "Short Price = $0.5 Long Price = $1.5",
                        async () => {
                            it("Appropriately burns and mints at the correct rate", async () => {
                                await createCommit(
                                    l2Encoder,
                                    poolCommitter,
                                    SHORT_MINT,
                                    amountCommitted
                                )
                                await timeout(updateInterval * 1000)
                                await pool.poolUpkeep(1, 1)
                                await timeout(updateInterval * 1000)
                                // Double price
                                await pool.poolUpkeep(1000, 2000)

                                await createCommit(
                                    l2Encoder,
                                    poolCommitter,
                                    LONG_BURN_THEN_MINT,
                                    amountCommitted,
                                    true
                                )

                                const balanceBefore =
                                    await poolCommitter.getAggregateBalance(
                                        signers[0].address
                                    )

                                await timeout(updateInterval * 1000)
                                await pool.poolUpkeep(2000, 2000)

                                // 2000 Long tokens burnt at $1.5 == $3000
                                // $3000 then minted to be Short tokens at $0.5 == 6000 pool tokens

                                const balance =
                                    await poolCommitter.getAggregateBalance(
                                        signers[0].address
                                    )
                                expect(balance.longTokens).to.equal(0)
                                expect(
                                    balance.shortTokens.sub(
                                        balanceBefore.shortTokens
                                    )
                                ).to.equal(ethers.utils.parseEther("6000"))
                            })
                        }
                    )
                })

                it("Allows for Multiple commits (adding up to a valid amount)", async () => {
                    // Commit using the balance in the contracts, which we just committed.
                    await createCommit(
                        l2Encoder,
                        poolCommitter,
                        LONG_BURN_THEN_MINT,
                        amountCommitted.div(2),
                        true
                    )
                    await createCommit(
                        l2Encoder,
                        poolCommitter,
                        LONG_BURN_THEN_MINT,
                        amountCommitted.div(2),
                        true
                    )
                    let longBalance = await pool.longBalance()
                    let shortBalance = await pool.shortBalance()
                    expect(longBalance).to.equal(amountCommitted)
                    expect(shortBalance).to.equal(0)

                    await timeout(updateInterval * 1000)

                    await pool.poolUpkeep(1, 1)

                    // Side balances should have switched
                    longBalance = await pool.longBalance()
                    shortBalance = await pool.shortBalance()
                    expect(longBalance).to.equal(0)
                    expect(shortBalance).to.equal(amountCommitted)

                    const userBalance = await poolCommitter.getAggregateBalance(
                        signers[0].address
                    )
                    expect(userBalance.longTokens).to.equal(0)

                    expect(userBalance.shortTokens).to.equal(amountCommitted)

                    const shortBalanceBefore = await shortToken.balanceOf(
                        signers[0].address
                    )

                    const settlementTokenBefore = await token.balanceOf(signers[0].address)

                    await poolCommitter.claim(signers[0].address)

                    const shortBalanceAfter = await shortToken.balanceOf(
                        signers[0].address
                    )

                    const settlementTokenAfter = await token.balanceOf(signers[0].address)

                    // Settlement token should not increase, because you're using all settlement to re-commit to other side
                    expect(settlementTokenAfter.sub(settlementTokenBefore)).to.equal(0)

                    expect(shortBalanceAfter.sub(shortBalanceBefore)).to.equal(
                        amountCommitted
                    )
                })

                it("Should Allow for execution and updating of balances with one single commit", async () => {
                    // Commit using the balance in the contracts, which we just committed.
                    await createCommit(
                        l2Encoder,
                        poolCommitter,
                        LONG_BURN_THEN_MINT,
                        amountCommitted,
                        true
                    )
                    let longBalance = await pool.longBalance()
                    let shortBalance = await pool.shortBalance()
                    expect(longBalance).to.equal(amountCommitted)
                    expect(shortBalance).to.equal(0)
                    expect(
                        (
                            await getCurrentUserCommit(
                                signers[0].address,
                                poolCommitter
                            )
                        ).longBurnShortMintPoolTokens
                    ).to.equal(amountCommitted)

                    await timeout(updateInterval * 1000)

                    await pool.poolUpkeep(1, 1)

                    // Side balances should have switched
                    longBalance = await pool.longBalance()
                    shortBalance = await pool.shortBalance()
                    expect(longBalance).to.equal(0)
                    expect(shortBalance).to.equal(amountCommitted)

                    const userBalance = await poolCommitter.getAggregateBalance(
                        signers[0].address
                    )
                    expect(userBalance.longTokens).to.equal(0)

                    expect(userBalance.shortTokens).to.equal(amountCommitted)

                    const shortBalanceBefore = await shortToken.balanceOf(
                        signers[0].address
                    )

                    const settlementTokenBefore = await token.balanceOf(signers[0].address)

                    await poolCommitter.claim(signers[0].address)

                    const settlementTokenAfter = await token.balanceOf(signers[0].address)

                    // Settlement token should not increase, because you're using all settlement to re-commit to other side
                    expect(settlementTokenAfter.sub(settlementTokenBefore)).to.equal(0)

                    const shortBalanceAfter = await shortToken.balanceOf(
                        signers[0].address
                    )

                    expect(shortBalanceAfter.sub(shortBalanceBefore)).to.equal(
                        amountCommitted
                    )
                })
            })
        }
    )

    context("Long Burning then minting in one commit, from wallet", () => {
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

            await token.approve(pool.address, amountCommitted.mul(999))
            await pool.setKeeper(signers[0].address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Should appropriately set values", async () => {
            // Commit using the balance in the contracts, which we just committed.
            await poolCommitter.claim(signers[0].address)
            const longTokenSupplyBefore = await longToken.totalSupply()
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_BURN_THEN_MINT,
                amountCommitted
            )
            const longTokenSupplyAfter = await longToken.totalSupply()

            const userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            const totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )

            // Supply decreases
            expect(longTokenSupplyAfter).to.equal(
                longTokenSupplyBefore.sub(amountCommitted)
            )
            // Commitment storage updates
            expect(userMostRecentCommit.longBurnShortMintPoolTokens).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.longBurnPoolTokens).to.equal(0)
            expect(totalMostRecentCommit.longBurnShortMintPoolTokens).to.equal(
                amountCommitted
            )
        })

        context("Invalid commitments", () => {
            it("Should revert if you are attempting to LONG_BURN_THEN_MINT duplicate times (from wallet)", async () => {
                // Commit using the balance in the wallet, which we just committed.
                await poolCommitter.claim(signers[0].address)
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    LONG_BURN_THEN_MINT,
                    amountCommitted
                )
                await expect(
                    createCommit(
                        l2Encoder,
                        poolCommitter,
                        LONG_BURN_THEN_MINT,
                        amountCommitted
                    )
                ).to.be.revertedWith("ERC20: burn amount exceeds balance")
            })

            it("Should revert if you are attempting to LONG_BURN_THEN_MINT duplicate times (from aggregate balance)", async () => {
                // Commit using the balance in the contracts, which we just committed.
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    LONG_BURN_THEN_MINT,
                    amountCommitted,
                    true
                )
                await expect(
                    createCommit(
                        l2Encoder,
                        poolCommitter,
                        LONG_BURN_THEN_MINT,
                        amountCommitted,
                        true
                    )
                ).to.be.reverted
            })

            it("Should revert if you are attempting to LONG_BURN_THEN_MINT too many tokens (from wallet)", async () => {
                // Commit using the balance in the wallet, which we just committed.
                await poolCommitter.claim(signers[0].address)
                await expect(
                    createCommit(
                        l2Encoder,
                        poolCommitter,
                        LONG_BURN_THEN_MINT,
                        amountCommitted.add(1)
                    )
                ).to.be.revertedWith("ERC20: burn amount exceeds balance")
            })

            it("Should revert if you are attempting to LONG_BURN_THEN_MINT too many tokens (from aggregate balance)", async () => {
                // Commit using the balance in the contracts, which we just committed.
                await expect(
                    createCommit(
                        l2Encoder,
                        poolCommitter,
                        LONG_BURN_THEN_MINT,
                        amountCommitted.add(1),
                        true
                    )
                ).to.be.revertedWith("Insufficient pool tokens")
            })
        })

        context("Valid execution", async () => {
            context("Different prices per token", () => {
                context("Short Price = $0.5 Long Price = $1.5", async () => {
                    it("Appropriately burns and mints at the correct rate", async () => {
                        await createCommit(
                            l2Encoder,
                            poolCommitter,
                            SHORT_MINT,
                            amountCommitted
                        )
                        await timeout(updateInterval * 1000)
                        await pool.poolUpkeep(1, 1)
                        await timeout(updateInterval * 1000)
                        // Double price
                        await pool.poolUpkeep(1000, 2000)
                        await poolCommitter.claim(signers[0].address)

                        await createCommit(
                            l2Encoder,
                            poolCommitter,
                            LONG_BURN_THEN_MINT,
                            amountCommitted
                        )

                        const balanceBefore =
                            await poolCommitter.getAggregateBalance(
                                signers[0].address
                            )

                        await timeout(updateInterval * 1000)
                        await pool.poolUpkeep(2000, 2000)

                        // 2000 Long tokens burnt at $1.5 == $3000
                        // $3000 then minted to be Short tokens at $0.5 == 6000 pool tokens

                        const balance = await poolCommitter.getAggregateBalance(
                            signers[0].address
                        )
                        expect(balance.longTokens).to.equal(0)
                        expect(
                            balance.shortTokens.sub(balanceBefore.shortTokens)
                        ).to.equal(ethers.utils.parseEther("6000"))
                    })
                })
            })

            it("Multiple commits (adding up to a valid amount)", async () => {
                // Commit using the balance in the contracts, which we just committed.
                await poolCommitter.claim(signers[0].address)
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    LONG_BURN_THEN_MINT,
                    amountCommitted.div(2)
                )
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    LONG_BURN_THEN_MINT,
                    amountCommitted.div(2)
                )
                let longBalance = await pool.longBalance()
                let shortBalance = await pool.shortBalance()
                expect(longBalance).to.equal(amountCommitted)
                expect(shortBalance).to.equal(0)

                await timeout(updateInterval * 1000)

                await pool.poolUpkeep(1, 1)

                // Side balances should have switched
                longBalance = await pool.longBalance()
                shortBalance = await pool.shortBalance()
                expect(longBalance).to.equal(0)
                expect(shortBalance).to.equal(amountCommitted)

                const userBalance = await poolCommitter.getAggregateBalance(
                    signers[0].address
                )
                expect(userBalance.longTokens).to.equal(0)

                expect(userBalance.shortTokens).to.equal(amountCommitted)

                const shortBalanceBefore = await shortToken.balanceOf(
                    signers[0].address
                )

                await poolCommitter.claim(signers[0].address)

                const shortBalanceAfter = await shortToken.balanceOf(
                    signers[0].address
                )

                expect(shortBalanceAfter.sub(shortBalanceBefore)).to.equal(
                    amountCommitted
                )
            })

            it("Should Allow for execution and updating of balances with one single commit", async () => {
                // Commit using the balance in the contracts, which we just committed.
                await poolCommitter.claim(signers[0].address)
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    LONG_BURN_THEN_MINT,
                    amountCommitted
                )
                let longBalance = await pool.longBalance()
                let shortBalance = await pool.shortBalance()
                expect(longBalance).to.equal(amountCommitted)
                expect(shortBalance).to.equal(0)

                await timeout(updateInterval * 1000)

                await pool.poolUpkeep(1, 1)

                // Side balances should have switched
                longBalance = await pool.longBalance()
                shortBalance = await pool.shortBalance()
                expect(longBalance).to.equal(0)
                expect(shortBalance).to.equal(amountCommitted)

                const userBalance = await poolCommitter.getAggregateBalance(
                    signers[0].address
                )
                expect(userBalance.longTokens).to.equal(0)

                expect(userBalance.shortTokens).to.equal(amountCommitted)

                const shortBalanceBefore = await shortToken.balanceOf(
                    signers[0].address
                )

                await poolCommitter.claim(signers[0].address)

                const shortBalanceAfter = await shortToken.balanceOf(
                    signers[0].address
                )

                expect(shortBalanceAfter.sub(shortBalanceBefore)).to.equal(
                    amountCommitted
                )
            })
        })
    })

    context("Short Burning then minting in one commit, from wallet", () => {
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
            l2Encoder = result.l2Encoder

            await token.approve(pool.address, amountCommitted.mul(999))
            await pool.setKeeper(signers[0].address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Should appropriately set values", async () => {
            // Commit using the balance in the contracts, which we just committed.
            await poolCommitter.claim(signers[0].address)
            const shortTokenSupplyBefore = await shortToken.totalSupply()
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_BURN_THEN_MINT,
                amountCommitted
            )
            const shortTokenSupplyAfter = await shortToken.totalSupply()

            const userMostRecentCommit = await getCurrentUserCommit(
                signers[0].address,
                poolCommitter
            )
            const totalMostRecentCommit = await getCurrentTotalCommit(
                poolCommitter
            )

            // Supply decreases
            expect(shortTokenSupplyAfter).to.equal(
                shortTokenSupplyBefore.sub(amountCommitted)
            )
            // Commitment storage updates
            expect(userMostRecentCommit.shortBurnLongMintPoolTokens).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.shortBurnPoolTokens).to.equal(0)
            expect(totalMostRecentCommit.shortBurnLongMintPoolTokens).to.equal(
                amountCommitted
            )
        })

        context("Invalid commitments", () => {
            it("Should revert if you are attempting to SHORT_BURN_THEN_MINT duplicate times (from wallet)", async () => {
                // Commit using the balance in the wallet, which we just committed.
                await poolCommitter.claim(signers[0].address)
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_BURN_THEN_MINT,
                    amountCommitted
                )
                await expect(
                    createCommit(
                        l2Encoder,
                        poolCommitter,
                        SHORT_BURN_THEN_MINT,
                        amountCommitted
                    )
                ).to.be.revertedWith("ERC20: burn amount exceeds balance")
            })

            it("Should revert if you are attempting to SHORT_BURN_THEN_MINT duplicate times (from aggregate balance)", async () => {
                // Commit using the balance in the contracts, which we just committed.
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_BURN_THEN_MINT,
                    amountCommitted,
                    true
                )
                await expect(
                    createCommit(
                        l2Encoder,
                        poolCommitter,
                        SHORT_BURN_THEN_MINT,
                        amountCommitted,
                        true
                    )
                ).to.be.revertedWith("Insufficient pool tokens")
            })

            it("Should revert if you are attempting to SHORT_BURN_THEN_MINT too many tokens (from wallet)", async () => {
                // Commit using the balance in the wallet, which we just committed.
                await poolCommitter.claim(signers[0].address)
                await expect(
                    createCommit(
                        l2Encoder,
                        poolCommitter,
                        SHORT_BURN_THEN_MINT,
                        amountCommitted.add(1)
                    )
                ).to.be.revertedWith("ERC20: burn amount exceeds balance")
            })

            it("Should revert if you are attempting to SHORT_BURN_THEN_MINT too many tokens (from aggregate balance)", async () => {
                // Commit using the balance in the contracts, which we just committed.
                await expect(
                    createCommit(
                        l2Encoder,
                        poolCommitter,
                        SHORT_BURN_THEN_MINT,
                        amountCommitted.add(1),
                        true
                    )
                ).to.be.revertedWith("Insufficient pool tokens")
            })
        })

        context("Valid execution", async () => {
            context("Different prices per token", () => {
                context("Short Price = $0.5 Long Price = $1.5", async () => {
                    it("Appropriately burns and mints at the correct rate", async () => {
                        await createCommit(
                            l2Encoder,
                            poolCommitter,
                            LONG_MINT,
                            amountCommitted
                        )
                        await timeout(updateInterval * 1000)
                        await pool.poolUpkeep(1, 1)
                        await timeout(updateInterval * 1000)
                        // Double price
                        await pool.poolUpkeep(1000, 2000)
                        await poolCommitter.claim(signers[0].address)

                        const balanceBefore =
                            await poolCommitter.getAggregateBalance(
                                signers[0].address
                            )
                        await createCommit(
                            l2Encoder,
                            poolCommitter,
                            SHORT_BURN_THEN_MINT,
                            amountCommitted
                        )

                        await timeout(updateInterval * 1000)
                        await pool.poolUpkeep(2000, 2000)

                        // 2000 Short tokens burnt at $0.5 == $1000
                        // $1000 then minted to be Long tokens at $1.5 == 666.6 pool tokens
                        const balance = await poolCommitter.getAggregateBalance(
                            signers[0].address
                        )
                        expect(
                            balance.longTokens.sub(balanceBefore.longTokens)
                        ).to.equal(
                            ethers.utils.parseEther("666.666666666666666666")
                        )
                        expect(balance.shortTokens).to.equal(0)
                    })
                })
            })

            it("Multiple commits (adding up to a valid amount)", async () => {
                // Commit using the balance in the contracts, which we just committed.
                await poolCommitter.claim(signers[0].address)
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_BURN_THEN_MINT,
                    amountCommitted.div(2)
                )
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_BURN_THEN_MINT,
                    amountCommitted.div(2)
                )
                let longBalance = await pool.longBalance()
                let shortBalance = await pool.shortBalance()
                expect(shortBalance).to.equal(amountCommitted)
                expect(longBalance).to.equal(0)

                await timeout(updateInterval * 1000)

                await pool.poolUpkeep(1, 1)

                // Side balances should have switched
                longBalance = await pool.longBalance()
                shortBalance = await pool.shortBalance()
                expect(shortBalance).to.equal(0)
                expect(longBalance).to.equal(amountCommitted)

                const userBalance = await poolCommitter.getAggregateBalance(
                    signers[0].address
                )
                expect(userBalance.shortTokens).to.equal(0)

                expect(userBalance.longTokens).to.equal(amountCommitted)

                const longBalanceBefore = await longToken.balanceOf(
                    signers[0].address
                )

                const settlementTokenBefore = await token.balanceOf(signers[0].address)

                await poolCommitter.claim(signers[0].address)

                const settlementTokenAfter = await token.balanceOf(signers[0].address)

                // Settlement token should not increase, because you're using all settlement to re-commit to other side
                expect(settlementTokenAfter.sub(settlementTokenBefore)).to.equal(0)

                const longBalanceAfter = await longToken.balanceOf(
                    signers[0].address
                )

                expect(longBalanceAfter.sub(longBalanceBefore)).to.equal(
                    amountCommitted
                )
            })

            it("Should Allow for execution and updating of balances with one single commit", async () => {
                // Commit using the balance in the contracts, which we just committed.
                await poolCommitter.claim(signers[0].address)
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_BURN_THEN_MINT,
                    amountCommitted
                )
                let longBalance = await pool.longBalance()
                let shortBalance = await pool.shortBalance()
                expect(shortBalance).to.equal(amountCommitted)
                expect(longBalance).to.equal(0)

                await timeout(updateInterval * 1000)

                await pool.poolUpkeep(1, 1)

                // Side balances should have switched
                longBalance = await pool.longBalance()
                shortBalance = await pool.shortBalance()
                expect(shortBalance).to.equal(0)
                expect(longBalance).to.equal(amountCommitted)

                const userBalance = await poolCommitter.getAggregateBalance(
                    signers[0].address
                )
                expect(userBalance.shortTokens).to.equal(0)

                expect(userBalance.longTokens).to.equal(amountCommitted)

                const longBalanceBefore = await shortToken.balanceOf(
                    signers[0].address
                )

                const settlementTokenBefore = await token.balanceOf(signers[0].address)

                await poolCommitter.claim(signers[0].address)

                const settlementTokenAfter = await token.balanceOf(signers[0].address)

                // Settlement token should not increase, because you're using all settlement to re-commit to other side
                expect(settlementTokenAfter.sub(settlementTokenBefore)).to.equal(0)

                const longBalanceAfter = await longToken.balanceOf(
                    signers[0].address
                )

                expect(longBalanceAfter.sub(longBalanceBefore)).to.equal(
                    amountCommitted
                )
            })
        })
    })

    context(
        "Commitments with frontrunning interval 5x larger than update interval",
        () => {
            beforeEach(async () => {
                const result = await deployPoolAndTokenContracts(
                    POOL_CODE,
                    updateInterval * 5,
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

                await token.approve(pool.address, amountCommitted.mul(999))
                await pool.setKeeper(signers[0].address)
            })

            context("Committing", async () => {
                it("Sets the correct update interval's values", async () => {
                    const updateIntervalId =
                        await poolCommitter.updateIntervalId()
                    await createCommit(
                        l2Encoder,
                        poolCommitter,
                        SHORT_MINT,
                        amountCommitted
                    )

                    const currentCommitment = await getCurrentUserCommit(
                        signers[0].address,
                        poolCommitter
                    )
                    const totalCommitment = await getCurrentTotalCommit(
                        poolCommitter
                    )
                    expect(currentCommitment.shortMintSettlement).to.equal(0)
                    expect(totalCommitment.shortMintSettlement).to.equal(0)

                    const fiveInFutureUser =
                        await poolCommitter.userCommitments(
                            signers[0].address,
                            updateIntervalId.add(5)
                        )
                    const fiveInFutureTotal =
                        await poolCommitter.totalPoolCommitments(
                            updateIntervalId.add(5)
                        )

                    expect(fiveInFutureUser.shortMintSettlement).to.equal(
                        amountCommitted
                    )
                    expect(fiveInFutureTotal.shortMintSettlement).to.equal(
                        amountCommitted
                    )
                })
            })

            context("Executing", async () => {
                it("Correctly executes and updates balance", async () => {
                    const updateIntervalId =
                        await poolCommitter.updateIntervalId()
                    await createCommit(
                        l2Encoder,
                        poolCommitter,
                        SHORT_MINT,
                        amountCommitted
                    )

                    const currentCommitment = await getCurrentUserCommit(
                        signers[0].address,
                        poolCommitter
                    )
                    const totalCommitment = await getCurrentTotalCommit(
                        poolCommitter
                    )
                    expect(currentCommitment.shortMintSettlement).to.equal(0)
                    expect(totalCommitment.shortMintSettlement).to.equal(0)

                    const fiveInFutureUser =
                        await poolCommitter.userCommitments(
                            signers[0].address,
                            updateIntervalId.add(5)
                        )
                    const fiveInFutureTotal =
                        await poolCommitter.totalPoolCommitments(
                            updateIntervalId.add(5)
                        )

                    expect(fiveInFutureUser.shortMintSettlement).to.equal(
                        amountCommitted
                    )
                    expect(fiveInFutureTotal.shortMintSettlement).to.equal(
                        amountCommitted
                    )

                    await timeout(updateInterval * 6 * 1000)
                    await pool.poolUpkeep(1, 1)

                    let userBalance = await poolCommitter.getAggregateBalance(
                        signers[0].address
                    )

                    expect(userBalance.shortTokens).to.equal(amountCommitted)
                })
            })

            context(
                "Multiple commitments over multiple update intervals",
                async () => {
                    it("Correctly executes and updates balance", async () => {
                        const updateIntervalId =
                            await poolCommitter.updateIntervalId()

                        // Commit for updateIntervalId + 5
                        await createCommit(
                            l2Encoder,
                            poolCommitter,
                            SHORT_MINT,
                            amountCommitted
                        )

                        // updateIntervalId
                        await timeout(updateInterval * 1000)
                        await pool.poolUpkeep(1, 1)

                        // Commit for updateIntervalId + 6
                        await createCommit(
                            l2Encoder,
                            poolCommitter,
                            SHORT_MINT,
                            amountCommitted
                        )

                        // updateIntervalId + 1
                        await timeout(updateInterval * 1000)
                        await pool.poolUpkeep(1, 1)

                        // Commit for updateIntervalId + 7
                        await createCommit(
                            l2Encoder,
                            poolCommitter,
                            LONG_MINT,
                            amountCommitted
                        )

                        // updateIntervalId + 2
                        await timeout(updateInterval * 1000)
                        await pool.poolUpkeep(1, 1)

                        // Commit for updateIntervalId + 8
                        await createCommit(
                            l2Encoder,
                            poolCommitter,
                            LONG_MINT,
                            amountCommitted
                        )
                        // Commit for updateIntervalId + 8
                        await createCommit(
                            l2Encoder,
                            poolCommitter,
                            LONG_MINT,
                            amountCommitted
                        )

                        // updateIntervalId + 3
                        await timeout(updateInterval * 1000)
                        await pool.poolUpkeep(1, 1)

                        // updateIntervalId + 4
                        await timeout(updateInterval * 1000)
                        await pool.poolUpkeep(1, 1)

                        // Commit for updateIntervalId + 10
                        await createCommit(
                            l2Encoder,
                            poolCommitter,
                            LONG_MINT,
                            amountCommitted
                        )

                        // updateIntervalId + 5
                        await timeout(updateInterval * 1000)
                        await pool.poolUpkeep(1, 1)
                        // 5th update interval. Balance should be updated
                        let userBalance =
                            await poolCommitter.getAggregateBalance(
                                signers[0].address
                            )

                        expect(userBalance.shortTokens).to.equal(
                            amountCommitted
                        )

                        // updateIntervalId + 6
                        await timeout(updateInterval * 1000)
                        await pool.poolUpkeep(1, 1)
                        // 6th update interval. Balance should be updated
                        userBalance = await poolCommitter.getAggregateBalance(
                            signers[0].address
                        )

                        expect(userBalance.shortTokens).to.equal(
                            amountCommitted.mul(2)
                        )

                        let futureUser = await poolCommitter.userCommitments(
                            signers[0].address,
                            updateIntervalId.add(10)
                        )
                        let futureTotal =
                            await poolCommitter.totalPoolCommitments(
                                updateIntervalId.add(10)
                            )

                        expect(futureUser.shortMintSettlement).to.equal(0)
                        expect(futureTotal.shortMintSettlement).to.equal(0)
                        expect(futureUser.longMintSettlement).to.equal(
                            amountCommitted
                        )
                        expect(futureTotal.longMintSettlement).to.equal(
                            amountCommitted
                        )

                        await timeout(updateInterval * 10 * 1000)
                        await pool.poolUpkeep(1, 1)

                        userBalance = await poolCommitter.getAggregateBalance(
                            signers[0].address
                        )
                        expect(userBalance.shortTokens).to.equal(
                            amountCommitted.mul(2)
                        )
                        expect(userBalance.longTokens).to.equal(
                            amountCommitted.mul(4)
                        )
                        expect(userBalance.settlementTokens).to.equal(0)
                    })

                    context("Big gap between", async () => {
                        it("Correctly executes and updates balance", async () => {
                            const updateIntervalId =
                                await poolCommitter.updateIntervalId()

                            // Commit for updateIntervalId + 5
                            await createCommit(
                                l2Encoder,
                                poolCommitter,
                                SHORT_MINT,
                                amountCommitted
                            )

                            for (let i = 0; i < 30; i++) {
                                await timeout(updateInterval * 1000)
                                await pool.poolUpkeep(1, 1)
                            }

                            await createCommit(
                                l2Encoder,
                                poolCommitter,
                                LONG_MINT,
                                amountCommitted
                            )

                            let userBalance =
                                await poolCommitter.getAggregateBalance(
                                    signers[0].address
                                )

                            expect(userBalance.shortTokens).to.equal(
                                amountCommitted
                            )

                            await timeout((updateInterval + 100) * 6 * 1000)
                            await pool.poolUpkeep(1, 1)

                            userBalance =
                                await poolCommitter.getAggregateBalance(
                                    signers[0].address
                                )

                            expect(userBalance.shortTokens).to.equal(
                                amountCommitted
                            )
                            expect(userBalance.longTokens).to.equal(
                                amountCommitted
                            )

                            await poolCommitter.claim(signers[0].address)

                            expect(
                                await longToken.balanceOf(signers[0].address)
                            ).to.equal(amountCommitted)
                            expect(
                                await shortToken.balanceOf(signers[0].address)
                            ).to.equal(amountCommitted)

                            /*
                    // 5th update interval. Balance should be updated
                    let userBalance = await poolCommitter.getAggregateBalance(signers[0].address)

                    expect(userBalance.shortTokens).to.equal(amountCommitted)

                    // updateIntervalId + 6
                    await timeout(updateInterval * 1000)
                    await pool.poolUpkeep(1, 1)
                    // 6th update interval. Balance should be updated
                    userBalance = await poolCommitter.getAggregateBalance(signers[0].address)

                    expect(userBalance.shortTokens).to.equal(amountCommitted.mul(2))

                    let futureUser = await poolCommitter.userCommitments(signers[0].address, updateIntervalId.add(10))
                    let futureTotal = await poolCommitter.totalPoolCommitments(updateIntervalId.add(10))

                    expect(futureUser.shortMintSettlement).to.equal(0);
                    expect(futureTotal.shortMintSettlement).to.equal(0);
                    expect(futureUser.longMintSettlement).to.equal(amountCommitted);
                    expect(futureTotal.longMintSettlement).to.equal(amountCommitted);

                    await timeout(updateInterval * 10 * 1000)
                    await pool.poolUpkeep(1, 1)

                    userBalance = await poolCommitter.getAggregateBalance(signers[0].address)
                    expect(userBalance.shortTokens).to.equal(amountCommitted.mul(2))
                    expect(userBalance.longTokens).to.equal(amountCommitted.mul(4))
                    expect(userBalance.settlementTokens).to.equal(0)
                    */
                        })
                    })
                }
            )
        }
    )

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
        it("should not require a settlement token transfer for short burn commits", async () => {
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )

            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
            await poolCommitter.claim(signers[0].address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_BURN,
                amountCommitted
            )

            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })
        it("should not require a settlement token transfer for long burn commits", async () => {
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
            await poolCommitter.claim(signers[0].address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_BURN,
                amountCommitted
            )
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })
        it("should burn the user's short pair tokens for short burn commits", async () => {
            // Acquire pool tokens
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            await poolCommitter.claim(signers[0].address)

            expect(await shortToken.balanceOf(signers[0].address)).to.eq(
                amountCommitted
            )
            await poolCommitter.claim(signers[0].address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_BURN,
                amountCommitted
            )
            expect(await shortToken.balanceOf(signers[0].address)).to.eq(0)
        })
        it("should burn the user's long pair tokens for long burn commits", async () => {
            // Acquire pool tokens
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect(await longToken.balanceOf(signers[0].address)).to.eq(0)
            await poolCommitter.claim(signers[0].address)
            expect(await longToken.balanceOf(signers[0].address)).to.eq(
                amountCommitted
            )
            await poolCommitter.claim(signers[0].address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_BURN,
                amountCommitted
            )
            expect(await longToken.balanceOf(signers[0].address)).to.eq(0)
        })
        it("should transfer the user's settlement tokens into the pool for long mint commits", async () => {
            expect(await token.balanceOf(pool.address)).to.eq(0)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })

        it("should transfer the user's settlement tokens into the pool for short mint commits", async () => {
            expect(await token.balanceOf(pool.address)).to.eq(0)
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )
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
