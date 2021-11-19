import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
} from "../../types"

import {
    POOL_CODE,
    DEFAULT_FEE,
    LONG_MINT,
    LONG_BURN,
    SHORT_MINT,
} from "../constants"
import {
    deployPoolAndTokenContracts,
    getRandomInt,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
} from "../utilities"
import { BigNumber } from "ethers"
chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const secondFeeAddress = generateRandomAddress()
const lastPrice = ethers.utils.parseEther(getRandomInt(99999999, 1).toString())
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = ethers.utils.parseEther("0.1")
const leverage = 1

describe("LeveragedPool - feeTransfer", () => {
    let poolCommitter: PoolCommitter
    let token: TestToken
    let shortToken: ERC20
    let longToken: ERC20
    let pool: LeveragedPool
    let library: PoolSwapLibrary

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
        poolCommitter = result.poolCommitter

        token = result.token
        shortToken = result.shortToken
        longToken = result.longToken

        await token.approve(pool.address, amountMinted)

        // Long mint commit
        await createCommit(poolCommitter, LONG_MINT, amountCommitted)
        // short mint commit
        await createCommit(poolCommitter, SHORT_MINT, amountCommitted)

        await shortToken.approve(pool.address, amountMinted)
        await longToken.approve(pool.address, await longToken.totalSupply())
        await timeout(updateInterval * 1000)
        const signers = await ethers.getSigners()
        await pool.setKeeper(signers[0].address)

        // No price change so only commits are executed
        await pool.poolUpkeep(lastPrice, lastPrice)

        // await poolCommitter.updateAggregateBalance(signers[0].address)
        await poolCommitter.claim(signers[0].address)
        // End state: `amountCommitted` worth of Long and short token minted. Price = lastPrice
    })

    it("Transfers fee to correct address and correct amount", async () => {
        pool.updateSecondaryFeeAddress(
            "0x0000000000000000000000000000000000000000"
        )
        await timeout(updateInterval * 1000)
        await pool.poolUpkeep(lastPrice, BigNumber.from("2").mul(lastPrice))
        let feesPercentPerPeriod = (0.1 * updateInterval) / (365 * 24 * 60 * 60)
        let feesPaidExpected = feesPercentPerPeriod * 4000
        let feesPaid = await token.balanceOf(feeAddress)
        expect(parseFloat(ethers.utils.formatEther(feesPaid))).closeTo(
            feesPaidExpected,
            0.00001
        )
    })

    it("Transfers fee to secondary address as well", async () => {
        pool.updateSecondaryFeeAddress(secondFeeAddress)
        await timeout(updateInterval * 1000)
        await pool.poolUpkeep(lastPrice, BigNumber.from("2").mul(lastPrice))
        let feesPercentPerPeriod = (0.1 * updateInterval) / (365 * 24 * 60 * 60)
        let feesPaidExpected = feesPercentPerPeriod * 4000
        let feesPaidPrimary = await token.balanceOf(feeAddress)
        let feesPaidSecondary = await token.balanceOf(secondFeeAddress)
        expect(parseFloat(ethers.utils.formatEther(feesPaidPrimary))).closeTo(
            feesPaidExpected * 0.9,
            0.00001
        )
        expect(parseFloat(ethers.utils.formatEther(feesPaidSecondary))).closeTo(
            feesPaidExpected * 0.1,
            0.00001
        )
    })

    context("Test Paused Pools cannot transfer tokens", async () => {
        beforeEach(async () => {
            await pool.pause()
        })
        it("Quote token transfer", async () => {
            expect(pool.quoteTokenTransfer(feeAddress, 123)).to.revertedWith(
                "Pool is paused"
            )
        })
        it("Pool token transfer", async () => {
            expect(
                pool.poolTokenTransfer(true, feeAddress, 123)
            ).to.revertedWith("Pool is paused")
        })
        it("Quote token transfer From", async () => {
            expect(
                pool.quoteTokenTransferFrom(feeAddress, pool.address, 123)
            ).to.revertedWith("Pool is paused")
        })
        it("Update fee address", async () => {
            expect(pool.updateFeeAddress(secondFeeAddress)).to.revertedWith(
                "Pool is paused"
            )
        })
        it("Set keeper", async () => {
            expect(pool.setKeeper(feeAddress)).to.revertedWith("Pool is paused")
        })
        it("Transfer governnance", async () => {
            expect(pool.transferGovernance(feeAddress)).to.revertedWith(
                "Pool is paused"
            )
        })
        it("Claim governnance", async () => {
            expect(pool.claimGovernance()).to.revertedWith("Pool is paused")
        })
    })
})
