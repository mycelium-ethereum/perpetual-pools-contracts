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
                await poolCommitter.commit(SHORT_MINT, amountCommitted, false)
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
            await poolCommitter.commit([0], amountCommitted, false)
            expect(
                (await poolCommitter.totalMostRecentCommit()).shortMintAmount
            ).to.eq(amountCommitted)
        })

        it("should update the shadow short burn balance for short burn commits", async () => {
            await await poolCommitter.commit(SHORT_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            await poolCommitter.claim(signers[0].address)

            expect(
                (await poolCommitter.totalMostRecentCommit()).shortBurnAmount
            ).to.eq(0)
            await poolCommitter.commit(SHORT_BURN, amountCommitted, false)
            expect(
                (await poolCommitter.totalMostRecentCommit()).shortBurnAmount
            ).to.eq(amountCommitted)
        })

        it("should update the shadow long mint balance for long mint commits", async () => {
            expect(
                (await poolCommitter.totalMostRecentCommit()).longMintAmount
            ).to.eq(0)
            await poolCommitter.commit(LONG_MINT, amountCommitted, false)

            expect(
                (await poolCommitter.totalMostRecentCommit()).longMintAmount
            ).to.eq(amountCommitted)
        })

        it("should update the shadow long burn balance for long burn commits", async () => {
            await poolCommitter.commit(LONG_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            await poolCommitter.claim(signers[0].address)

            expect(
                (await poolCommitter.totalMostRecentCommit()).longBurnAmount
            ).to.eq(0)
            await poolCommitter.commit(LONG_BURN, amountCommitted, false)
            expect(
                (await poolCommitter.totalMostRecentCommit()).longBurnAmount
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
            poolCommitter = result.poolCommitter

            await token.approve(pool.address, amountCommitted.mul(999))
            await pool.setKeeper(signers[0].address)
            await poolCommitter.commit(SHORT_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Should appropriately set values", async () => {
            // Commit using the balance in the contracts, which we just committed.
            const shortTokenSupplyBefore = await shortToken.totalSupply()
            await poolCommitter.commit(SHORT_BURN, amountCommitted, true)
            const shortTokenSupplyAfter = await shortToken.totalSupply()

            const userMostRecentCommit =
                await poolCommitter.userMostRecentCommit(signers[0].address)
            const totalMostRecentCommit =
                await poolCommitter.totalMostRecentCommit()

            expect(shortTokenSupplyAfter).to.equal(
                shortTokenSupplyBefore.sub(amountCommitted)
            ) // Supply decreases
            // Commitment storage updates
            expect(userMostRecentCommit.balanceShortBurnAmount).to.equal(
                amountCommitted
            )
            expect(userMostRecentCommit.shortBurnAmount).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.shortBurnAmount).to.equal(
                amountCommitted
            )
        })

        it("Should not allow for too many commitments (that bring amount over a user's balance)", async () => {
            await poolCommitter.commit(SHORT_BURN, amountCommitted, true)
            await expect(
                poolCommitter.commit(SHORT_BURN, amountCommitted, true)
            ).to.be.revertedWith("Insufficient pool tokens")
        })

        it("Should not allow commits that are too large", async () => {
            await expect(
                poolCommitter.commit(SHORT_BURN, amountCommitted.mul(300), true)
            ).to.be.revertedWith("Insufficient pool tokens")
        })

        it("Should allow for a combination of short_burn commits from wallet and aggregate balance", async () => {
            await poolCommitter.claim(signers[0].address)

            await poolCommitter.commit(SHORT_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)

            const shortTokenSupplyBefore = await shortToken.totalSupply()

            await poolCommitter.commit(SHORT_BURN, amountCommitted, true)

            const userCommit = await poolCommitter.userMostRecentCommit(
                signers[0].address
            )

            // balanceShortBurnAmount is updated
            expect(userCommit.balanceShortBurnAmount).to.equal(amountCommitted)
            await poolCommitter.commit(SHORT_BURN, amountCommitted, false)

            const shortTokenSupplyAfter = await shortToken.totalSupply()

            const userMostRecentCommit =
                await poolCommitter.userMostRecentCommit(signers[0].address)
            const totalMostRecentCommit =
                await poolCommitter.totalMostRecentCommit()

            // Supply decreases
            expect(shortTokenSupplyAfter).to.equal(
                shortTokenSupplyBefore.sub(amountCommitted).sub(amountCommitted)
            )

            // balanceShortBurnAmount gets cleared, because on the update from the second `commit`, it is used and can then be cleared
            expect(userMostRecentCommit.balanceShortBurnAmount).to.equal(0)
            expect(userMostRecentCommit.shortBurnAmount).to.equal(
                amountCommitted.mul(2)
            )
            expect(totalMostRecentCommit.shortBurnAmount).to.equal(
                amountCommitted.mul(2)
            )

            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)

            const balanceBefore = await token.balanceOf(signers[0].address)
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

            await token.approve(pool.address, amountCommitted.mul(999))
            await pool.setKeeper(signers[0].address)
            await poolCommitter.commit(SHORT_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
            await poolCommitter.claim(signers[0].address)
            // Burn, so you have settlement tokens in your aggregate balance
            await poolCommitter.commit(SHORT_BURN, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Should appropriately set values", async () => {
            // Commit using the balance in the contracts, which we just committed.
            const shortTokenSupplyBefore = await shortToken.totalSupply()
            await poolCommitter.commit(SHORT_MINT, amountCommitted, true)
            const shortTokenSupplyAfter = await shortToken.totalSupply()

            const userMostRecentCommit =
                await poolCommitter.userMostRecentCommit(signers[0].address)
            const totalMostRecentCommit =
                await poolCommitter.totalMostRecentCommit()

            expect(shortTokenSupplyAfter).to.equal(shortTokenSupplyBefore) // Supply stays same
            // Commitment storage updates
            expect(userMostRecentCommit.balanceShortMintAmount).to.equal(
                amountCommitted
            )
            expect(userMostRecentCommit.shortMintAmount).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.shortMintAmount).to.equal(
                amountCommitted
            )
        })

        it("Should not allow for too many commitments (that bring amount over a user's balance)", async () => {
            await poolCommitter.commit(SHORT_MINT, amountCommitted, true)
            await expect(
                poolCommitter.commit(SHORT_MINT, amountCommitted, true)
            ).to.be.revertedWith("Insufficient settlement tokens")
        })

        it("Should not allow commits that are too large", async () => {
            await expect(
                poolCommitter.commit(SHORT_MINT, amountCommitted.mul(300), true)
            ).to.be.revertedWith("Insufficient settlement tokens")
        })

        it("Should allow for a combination of short_mint commits from wallet and aggregate balance", async () => {
            const shortTokenSupplyBefore = await shortToken.totalSupply()

            await poolCommitter.commit(SHORT_MINT, amountCommitted, true)
            await poolCommitter.commit(SHORT_MINT, amountCommitted, false)

            const shortTokenSupplyAfter = await shortToken.totalSupply()

            const userMostRecentCommit =
                await poolCommitter.userMostRecentCommit(signers[0].address)
            const totalMostRecentCommit =
                await poolCommitter.totalMostRecentCommit()

            expect(shortTokenSupplyAfter).to.equal(shortTokenSupplyBefore) // Supply decreases
            // Commitment storage updates
            expect(userMostRecentCommit.balanceShortMintAmount).to.equal(
                amountCommitted
            )
            expect(userMostRecentCommit.shortMintAmount).to.equal(
                amountCommitted.mul(2)
            )
            expect(totalMostRecentCommit.shortMintAmount).to.equal(
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
            await poolCommitter.commit(LONG_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Should appropriately set values", async () => {
            // Commit using the balance in the contracts, which we just committed.
            const longTokenSupplyBefore = await longToken.totalSupply()
            await poolCommitter.commit(LONG_BURN, amountCommitted, true)
            const longTokenSupplyAfter = await longToken.totalSupply()

            const userMostRecentCommit =
                await poolCommitter.userMostRecentCommit(signers[0].address)
            const totalMostRecentCommit =
                await poolCommitter.totalMostRecentCommit()

            expect(longTokenSupplyAfter).to.equal(
                longTokenSupplyBefore.sub(amountCommitted)
            ) // Supply decreases
            // Commitment storage updates
            expect(userMostRecentCommit.balanceLongBurnAmount).to.equal(
                amountCommitted
            )
            expect(userMostRecentCommit.longBurnAmount).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.longBurnAmount).to.equal(
                amountCommitted
            )
        })

        it("Should not allow for too many commitments (that bring amount over a user's balance)", async () => {
            await poolCommitter.commit(LONG_BURN, amountCommitted, true)
            await expect(
                poolCommitter.commit(LONG_BURN, amountCommitted, true)
            ).to.be.revertedWith("Insufficient pool tokens")
        })

        it("Should not allow commits that are too large", async () => {
            await expect(
                poolCommitter.commit(LONG_BURN, amountCommitted.mul(300), true)
            ).to.be.revertedWith("Insufficient pool tokens")
        })

        it("Should allow for a combination of long_burn commits from wallet and aggregate balance", async () => {
            await poolCommitter.claim(signers[0].address)

            await poolCommitter.commit(LONG_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)

            const longTokenSupplyBefore = await longToken.totalSupply()

            await poolCommitter.commit(LONG_BURN, amountCommitted, true)

            const userCommit = await poolCommitter.userMostRecentCommit(
                signers[0].address
            )

            // balanceLongBurnAmount is updated
            expect(userCommit.balanceLongBurnAmount).to.equal(amountCommitted)
            await poolCommitter.commit(LONG_BURN, amountCommitted, false)

            const longTokenSupplyAfter = await longToken.totalSupply()

            // Supply decreases
            expect(longTokenSupplyAfter).to.equal(
                longTokenSupplyBefore.sub(amountCommitted).sub(amountCommitted)
            )

            const userMostRecentCommit =
                await poolCommitter.userMostRecentCommit(signers[0].address)
            const totalMostRecentCommit =
                await poolCommitter.totalMostRecentCommit()

            // balanceLongBurnAmount gets cleared, because on the update from the second `commit`, it is used and can then be cleared
            expect(userMostRecentCommit.balanceLongBurnAmount).to.equal(0)
            expect(userMostRecentCommit.longBurnAmount).to.equal(
                amountCommitted.mul(2)
            )
            expect(totalMostRecentCommit.longBurnAmount).to.equal(
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

            await token.approve(pool.address, amountCommitted.mul(999))
            await pool.setKeeper(signers[0].address)
            await poolCommitter.commit(LONG_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
            await poolCommitter.claim(signers[0].address)
            // Burn, so you have settlement tokens in your aggregate balance
            await poolCommitter.commit(LONG_BURN, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Should appropriately set values", async () => {
            // Commit using the balance in the contracts, which we just committed.
            const longTokenSupplyBefore = await longToken.totalSupply()
            await poolCommitter.commit(LONG_MINT, amountCommitted, true)
            const longTokenSupplyAfter = await longToken.totalSupply()

            const userMostRecentCommit =
                await poolCommitter.userMostRecentCommit(signers[0].address)
            const totalMostRecentCommit =
                await poolCommitter.totalMostRecentCommit()

            expect(longTokenSupplyAfter).to.equal(longTokenSupplyBefore) // Supply stays same
            // Commitment storage updates
            expect(userMostRecentCommit.balanceLongMintAmount).to.equal(
                amountCommitted
            )
            expect(userMostRecentCommit.longMintAmount).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.longMintAmount).to.equal(
                amountCommitted
            )
        })

        it("Should not allow for too many commitments (that bring amount over a user's balance)", async () => {
            await poolCommitter.commit(LONG_MINT, amountCommitted, true)
            await expect(
                poolCommitter.commit(LONG_MINT, amountCommitted, true)
            ).to.be.revertedWith("Insufficient settlement tokens")
        })

        it("Should not allow commits that are too large", async () => {
            await expect(
                poolCommitter.commit(LONG_MINT, amountCommitted.mul(300), true)
            ).to.be.revertedWith("Insufficient settlement tokens")
        })

        it("Should allow for a combination of long_mint commits from wallet and aggregate balance", async () => {
            const longTokenSupplyBefore = await longToken.totalSupply()

            await poolCommitter.commit(LONG_MINT, amountCommitted, true)

            const userCommit = await poolCommitter.userMostRecentCommit(
                signers[0].address
            )

            // Commitment storage updates
            expect(userCommit.balanceLongMintAmount).to.equal(amountCommitted)
            await poolCommitter.commit(LONG_MINT, amountCommitted, false)

            const longTokenSupplyAfter = await longToken.totalSupply()

            const userMostRecentCommit =
                await poolCommitter.userMostRecentCommit(signers[0].address)
            const totalMostRecentCommit =
                await poolCommitter.totalMostRecentCommit()

            expect(longTokenSupplyAfter).to.equal(longTokenSupplyBefore) // Supply decreases
            // Commitment storage updates
            expect(userMostRecentCommit.balanceLongMintAmount).to.equal(
                amountCommitted
            )
            expect(userMostRecentCommit.longMintAmount).to.equal(
                amountCommitted.mul(2)
            )
            expect(totalMostRecentCommit.longMintAmount).to.equal(
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
            await poolCommitter.commit(LONG_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
            await poolCommitter.claim(signers[0].address)
            // Burn, so you have settlement tokens in your aggregate balance
            await poolCommitter.commit(LONG_BURN, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Operates as intended", async () => {
            const longTokenSupplyBefore = await longToken.totalSupply()

            await poolCommitter.commit(LONG_MINT, amountCommitted, true)
            await poolCommitter.commit(LONG_MINT, amountCommitted, false)

            await poolCommitter.commit(SHORT_MINT, amountCommitted, false)

            const longTokenSupplyAfter = await longToken.totalSupply()

            const userMostRecentCommit =
                await poolCommitter.userMostRecentCommit(signers[0].address)
            const totalMostRecentCommit =
                await poolCommitter.totalMostRecentCommit()

            expect(longTokenSupplyAfter).to.equal(longTokenSupplyBefore) // Supply decreases
            // Commitment storage updates
            expect(userMostRecentCommit.balanceLongMintAmount).to.equal(
                amountCommitted
            )
            expect(userMostRecentCommit.longMintAmount).to.equal(
                amountCommitted.mul(2)
            )
            expect(totalMostRecentCommit.longMintAmount).to.equal(
                amountCommitted.mul(2)
            )

            expect(userMostRecentCommit.balanceShortMintAmount).to.equal(0)
            expect(userMostRecentCommit.shortMintAmount).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.shortMintAmount).to.equal(
                amountCommitted
            )

            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)

            const balanceBefore = await longToken.balanceOf(signers[0].address)

            await expect(
                poolCommitter.commit(SHORT_BURN, amountCommitted, false)
            ).to.be.revertedWith("ERC20: burn amount exceeds balance")

            await poolCommitter.commit(SHORT_BURN, amountCommitted.div(2), true)

            // Go into frontRunningInterval
            await timeout((updateInterval - frontRunningInterval / 2) * 1000)

            await poolCommitter.claim(signers[0].address)

            await expect(
                poolCommitter.commit(SHORT_BURN, amountCommitted.div(2), true)
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

                await token.approve(pool.address, amountCommitted.mul(999))
                await pool.setKeeper(signers[0].address)
                await poolCommitter.commit(LONG_MINT, amountCommitted, false)
                await timeout(updateInterval * 1000)
                await pool.poolUpkeep(1, 1)
            })

            it("Should appropriately set values", async () => {
                // Commit using the balance in the contracts, which we just committed.
                const longTokenSupplyBefore = await longToken.totalSupply()
                await poolCommitter.commit(
                    LONG_BURN_THEN_MINT,
                    amountCommitted,
                    true
                )
                const longTokenSupplyAfter = await longToken.totalSupply()

                const userMostRecentCommit =
                    await poolCommitter.userMostRecentCommit(signers[0].address)
                const totalMostRecentCommit =
                    await poolCommitter.totalMostRecentCommit()

                // Supply decreases
                expect(longTokenSupplyAfter).to.equal(
                    longTokenSupplyBefore.sub(amountCommitted)
                )
                // Commitment storage updates
                expect(userMostRecentCommit.balanceLongBurnMintAmount).to.equal(
                    amountCommitted
                )
                expect(userMostRecentCommit.longBurnMintAmount).to.equal(
                    amountCommitted
                )
                expect(totalMostRecentCommit.longBurnAmount).to.equal(0)
                expect(totalMostRecentCommit.longBurnMintAmount).to.equal(
                    amountCommitted
                )
            })

            context("Invalid commitments", () => {
                it("Should revert if you are attempting to LONG_BURN_THEN_MINT duplicate times (from wallet)", async () => {
                    // Commit using the balance in the wallet, which we just committed.
                    await poolCommitter.commit(
                        LONG_BURN_THEN_MINT,
                        amountCommitted,
                        true
                    )
                    await expect(
                        poolCommitter.commit(
                            LONG_BURN_THEN_MINT,
                            amountCommitted,
                            true
                        )
                    ).to.be.revertedWith("Insufficient pool tokens")
                })

                it("Should revert if you are attempting to LONG_BURN_THEN_MINT duplicate times (from aggregate balance)", async () => {
                    // Commit using the balance in the contracts, which we just committed.
                    await poolCommitter.commit(
                        LONG_BURN_THEN_MINT,
                        amountCommitted,
                        true
                    )
                    await expect(
                        poolCommitter.commit(
                            LONG_BURN_THEN_MINT,
                            amountCommitted,
                            true
                        )
                    ).to.be.revertedWith("Insufficient pool tokens")
                })

                it("Should revert if you are attempting to LONG_BURN_THEN_MINT too many tokens (from wallet)", async () => {
                    // Commit using the balance in the wallet, which we just committed.
                    await expect(
                        poolCommitter.commit(
                            LONG_BURN_THEN_MINT,
                            amountCommitted.add(1),
                            true
                        )
                    ).to.be.revertedWith("Insufficient pool tokens")
                })

                it("Should revert if you are attempting to LONG_BURN_THEN_MINT too many tokens (from aggregate balance)", async () => {
                    // Commit using the balance in the contracts, which we just committed.
                    await expect(
                        poolCommitter.commit(
                            LONG_BURN_THEN_MINT,
                            amountCommitted.add(1),
                            true
                        )
                    ).to.be.revertedWith("Insufficient pool tokens") // The error here is different from burning from wallet, because it does not burn from user's wallet and thus needs to manually check
                })
            })

            context("Valid execution", () => {
                context("Different prices per token", () => {
                    context(
                        "Short Price = $0.5 Long Price = $1.5",
                        async () => {
                            it("Appropriately burns and mints at the correct rate", async () => {
                                await poolCommitter.commit(
                                    SHORT_MINT,
                                    amountCommitted,
                                    false
                                )
                                await timeout(updateInterval * 1000)
                                await pool.poolUpkeep(1, 1)
                                await timeout(updateInterval * 1000)
                                // Double price
                                await pool.poolUpkeep(1000, 2000)

                                await poolCommitter.commit(
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
                    await poolCommitter.commit(
                        LONG_BURN_THEN_MINT,
                        amountCommitted.div(2),
                        true
                    )
                    await poolCommitter.commit(
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
                    await poolCommitter.commit(
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
                            await poolCommitter.userMostRecentCommit(
                                signers[0].address
                            )
                        ).balanceLongBurnMintAmount
                    ).to.equal(amountCommitted)
                    expect(
                        (
                            await poolCommitter.userMostRecentCommit(
                                signers[0].address
                            )
                        ).longBurnMintAmount
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

                    await poolCommitter.claim(signers[0].address)

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
            await poolCommitter.commit(LONG_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Should appropriately set values", async () => {
            // Commit using the balance in the contracts, which we just committed.
            await poolCommitter.claim(signers[0].address)
            const longTokenSupplyBefore = await longToken.totalSupply()
            await poolCommitter.commit(
                LONG_BURN_THEN_MINT,
                amountCommitted,
                false
            )
            const longTokenSupplyAfter = await longToken.totalSupply()

            const userMostRecentCommit =
                await poolCommitter.userMostRecentCommit(signers[0].address)
            const totalMostRecentCommit =
                await poolCommitter.totalMostRecentCommit()

            // Supply decreases
            expect(longTokenSupplyAfter).to.equal(
                longTokenSupplyBefore.sub(amountCommitted)
            )
            // Commitment storage updates
            expect(userMostRecentCommit.balanceLongBurnMintAmount).to.equal(0)
            expect(userMostRecentCommit.longBurnMintAmount).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.longBurnAmount).to.equal(0)
            expect(totalMostRecentCommit.longBurnMintAmount).to.equal(
                amountCommitted
            )
        })

        context("Invalid commitments", () => {
            it("Should revert if you are attempting to LONG_BURN_THEN_MINT duplicate times (from wallet)", async () => {
                // Commit using the balance in the wallet, which we just committed.
                await poolCommitter.claim(signers[0].address)
                await poolCommitter.commit(
                    LONG_BURN_THEN_MINT,
                    amountCommitted,
                    false
                )
                await expect(
                    poolCommitter.commit(
                        LONG_BURN_THEN_MINT,
                        amountCommitted,
                        false
                    )
                ).to.be.revertedWith("ERC20: burn amount exceeds balance")
            })

            it("Should revert if you are attempting to LONG_BURN_THEN_MINT duplicate times (from aggregate balance)", async () => {
                // Commit using the balance in the contracts, which we just committed.
                await poolCommitter.commit(
                    LONG_BURN_THEN_MINT,
                    amountCommitted,
                    true
                )
                await expect(
                    poolCommitter.commit(
                        LONG_BURN_THEN_MINT,
                        amountCommitted,
                        true
                    )
                ).to.be.revertedWith("Insufficient pool tokens")
            })

            it("Should revert if you are attempting to LONG_BURN_THEN_MINT too many tokens (from wallet)", async () => {
                // Commit using the balance in the wallet, which we just committed.
                await poolCommitter.claim(signers[0].address)
                await expect(
                    poolCommitter.commit(
                        LONG_BURN_THEN_MINT,
                        amountCommitted.add(1),
                        false
                    )
                ).to.be.revertedWith("ERC20: burn amount exceeds balance")
            })

            it("Should revert if you are attempting to LONG_BURN_THEN_MINT too many tokens (from aggregate balance)", async () => {
                // Commit using the balance in the contracts, which we just committed.
                await expect(
                    poolCommitter.commit(
                        LONG_BURN_THEN_MINT,
                        amountCommitted.add(1),
                        true
                    )
                ).to.be.revertedWith("Insufficient pool tokens") // The error here is different from burning from wallet, because it does not burn from user's wallet and thus needs to manually check
            })
        })

        context("Valid execution", async () => {
            context("Different prices per token", () => {
                context("Short Price = $0.5 Long Price = $1.5", async () => {
                    it("Appropriately burns and mints at the correct rate", async () => {
                        await poolCommitter.commit(
                            SHORT_MINT,
                            amountCommitted,
                            false
                        )
                        await timeout(updateInterval * 1000)
                        await pool.poolUpkeep(1, 1)
                        await timeout(updateInterval * 1000)
                        // Double price
                        await pool.poolUpkeep(1000, 2000)
                        await poolCommitter.claim(signers[0].address)

                        await poolCommitter.commit(
                            LONG_BURN_THEN_MINT,
                            amountCommitted,
                            false
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
                await poolCommitter.commit(
                    LONG_BURN_THEN_MINT,
                    amountCommitted.div(2),
                    false
                )
                await poolCommitter.commit(
                    LONG_BURN_THEN_MINT,
                    amountCommitted.div(2),
                    false
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
                await poolCommitter.commit(
                    LONG_BURN_THEN_MINT,
                    amountCommitted,
                    false
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

            await token.approve(pool.address, amountCommitted.mul(999))
            await pool.setKeeper(signers[0].address)
            await poolCommitter.commit(SHORT_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(1, 1)
        })

        it("Should appropriately set values", async () => {
            // Commit using the balance in the contracts, which we just committed.
            await poolCommitter.claim(signers[0].address)
            const shortTokenSupplyBefore = await shortToken.totalSupply()
            await poolCommitter.commit(
                SHORT_BURN_THEN_MINT,
                amountCommitted,
                false
            )
            const shortTokenSupplyAfter = await shortToken.totalSupply()

            const userMostRecentCommit =
                await poolCommitter.userMostRecentCommit(signers[0].address)
            const totalMostRecentCommit =
                await poolCommitter.totalMostRecentCommit()

            // Supply decreases
            expect(shortTokenSupplyAfter).to.equal(
                shortTokenSupplyBefore.sub(amountCommitted)
            )
            // Commitment storage updates
            expect(userMostRecentCommit.balanceShortBurnMintAmount).to.equal(0)
            expect(userMostRecentCommit.shortBurnMintAmount).to.equal(
                amountCommitted
            )
            expect(totalMostRecentCommit.shortBurnAmount).to.equal(0)
            expect(totalMostRecentCommit.shortBurnMintAmount).to.equal(
                amountCommitted
            )
        })

        context("Invalid commitments", () => {
            it("Should revert if you are attempting to SHORT_BURN_THEN_MINT duplicate times (from wallet)", async () => {
                // Commit using the balance in the wallet, which we just committed.
                await poolCommitter.claim(signers[0].address)
                await poolCommitter.commit(
                    SHORT_BURN_THEN_MINT,
                    amountCommitted,
                    false
                )
                await expect(
                    poolCommitter.commit(
                        SHORT_BURN_THEN_MINT,
                        amountCommitted,
                        false
                    )
                ).to.be.revertedWith("ERC20: burn amount exceeds balance")
            })

            it("Should revert if you are attempting to SHORT_BURN_THEN_MINT duplicate times (from aggregate balance)", async () => {
                // Commit using the balance in the contracts, which we just committed.
                await poolCommitter.commit(
                    SHORT_BURN_THEN_MINT,
                    amountCommitted,
                    true
                )
                await expect(
                    poolCommitter.commit(
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
                    poolCommitter.commit(
                        SHORT_BURN_THEN_MINT,
                        amountCommitted.add(1),
                        false
                    )
                ).to.be.revertedWith("ERC20: burn amount exceeds balance")
            })

            it("Should revert if you are attempting to SHORT_BURN_THEN_MINT too many tokens (from aggregate balance)", async () => {
                // Commit using the balance in the contracts, which we just committed.
                await expect(
                    poolCommitter.commit(
                        SHORT_BURN_THEN_MINT,
                        amountCommitted.add(1),
                        true
                    )
                ).to.be.revertedWith("Insufficient pool tokens") // The error here is different from burning from wallet, because it does not burn from user's wallet and thus needs to manually check
            })
        })

        context("Valid execution", async () => {
            context("Different prices per token", () => {
                context("Short Price = $0.5 Long Price = $1.5", async () => {
                    it("Appropriately burns and mints at the correct rate", async () => {
                        await poolCommitter.commit(
                            LONG_MINT,
                            amountCommitted,
                            false
                        )
                        await timeout(updateInterval * 1000)
                        await pool.poolUpkeep(1, 1)
                        await timeout(updateInterval * 1000)
                        // Double price
                        await pool.poolUpkeep(1000, 2000)
                        await poolCommitter.claim(signers[0].address)

                        await poolCommitter.commit(
                            SHORT_BURN_THEN_MINT,
                            amountCommitted,
                            false
                        )

                        const balanceBefore =
                            await poolCommitter.getAggregateBalance(
                                signers[0].address
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
                await poolCommitter.commit(
                    SHORT_BURN_THEN_MINT,
                    amountCommitted.div(2),
                    false
                )
                await poolCommitter.commit(
                    SHORT_BURN_THEN_MINT,
                    amountCommitted.div(2),
                    false
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

                await poolCommitter.claim(signers[0].address)

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
                await poolCommitter.commit(
                    SHORT_BURN_THEN_MINT,
                    amountCommitted,
                    false
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

                await poolCommitter.claim(signers[0].address)

                const longBalanceAfter = await longToken.balanceOf(
                    signers[0].address
                )

                expect(longBalanceAfter.sub(longBalanceBefore)).to.equal(
                    amountCommitted
                )
            })
        })
    })

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
            await poolCommitter.commit(SHORT_MINT, amountCommitted, false)

            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
            await poolCommitter.claim(signers[0].address)
            await poolCommitter.commit(SHORT_BURN, amountCommitted, false)

            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })
        it("should not require a quote token transfer for long burn commits", async () => {
            await await poolCommitter.commit(LONG_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
            await poolCommitter.claim(signers[0].address)
            await poolCommitter.commit(LONG_BURN, amountCommitted, false)
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })
        it("should burn the user's short pair tokens for short burn commits", async () => {
            // Acquire pool tokens
            await await poolCommitter.commit(SHORT_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            await poolCommitter.claim(signers[0].address)

            expect(await shortToken.balanceOf(signers[0].address)).to.eq(
                amountCommitted
            )
            await poolCommitter.claim(signers[0].address)
            await poolCommitter.commit(SHORT_BURN, amountCommitted, false)
            expect(await shortToken.balanceOf(signers[0].address)).to.eq(0)
        })
        it("should burn the user's long pair tokens for long burn commits", async () => {
            // Acquire pool tokens
            await await poolCommitter.commit(LONG_MINT, amountCommitted, false)
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect(await longToken.balanceOf(signers[0].address)).to.eq(0)
            await poolCommitter.claim(signers[0].address)
            expect(await longToken.balanceOf(signers[0].address)).to.eq(
                amountCommitted
            )
            await poolCommitter.claim(signers[0].address)
            await poolCommitter.commit(LONG_BURN, amountCommitted, false)
            expect(await longToken.balanceOf(signers[0].address)).to.eq(0)
        })
        it("should transfer the user's quote tokens into the pool for long mint commits", async () => {
            expect(await token.balanceOf(pool.address)).to.eq(0)
            await poolCommitter.commit(LONG_MINT, amountCommitted, false)
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })

        it("should transfer the user's quote tokens into the pool for short mint commits", async () => {
            expect(await token.balanceOf(pool.address)).to.eq(0)
            await poolCommitter.commit(SHORT_MINT, amountCommitted, false)
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
