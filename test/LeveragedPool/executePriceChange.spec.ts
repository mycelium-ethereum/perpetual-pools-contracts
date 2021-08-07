import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { ERC20, LeveragedPool, PoolSwapLibrary } from "../../typechain"

import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    timeout,
    createCommit,
} from "../utilities"

import { BigNumberish, BytesLike } from "ethers"
import { POOL_CODE } from "../constants"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const fee = "0x3ff947ae147ae147ae147ae147ae147a" // 2% per execution. An IEEE 754 quadruple precision number
const lastPrice = 77000000
const frontRunningInterval = 1
const updateInterval = 2
const leverage = 10

let library: PoolSwapLibrary
let pool: LeveragedPool
let quoteToken: ERC20

/**
 * Deploys the pool
 */
const setupHook = async () => {
    // Deploy leveraged pool
    const result = await deployPoolAndTokenContracts(
        POOL_CODE,
        frontRunningInterval,
        updateInterval,
        fee,
        leverage,
        feeAddress,
        amountMinted
    )
    library = result.library
    pool = result.pool
    quoteToken = result.token

    await quoteToken.approve(pool.address, amountMinted)
    const signers = await ethers.getSigners()
    await pool.setKeeper(signers[0].address)
}

/**
 * Adds 2000 quote tokens to each pool
 */
const fundPools = async () => {
    const shortMint = await createCommit(pool, [0], amountCommitted)
    const longMint = await createCommit(pool, [2], amountCommitted)
    await timeout(2000)
    await pool.executePriceChange(1, lastPrice)
    await pool.executeCommitment([shortMint.commitID, longMint.commitID])
    expect((await pool.shortBalance()).toString()).to.eq(
        amountCommitted.toString()
    )
    expect((await pool.longBalance()).toString()).to.eq(
        amountCommitted.toString()
    )
}
const calculateFee = async (fee: string, amount: BigNumberish) => {
    return await library.convertDecimalToUInt(
        await library.multiplyDecimalByUInt(fee, amount)
    )
}

describe("LeveragedPool - executePriceUpdate", () => {
    describe("Base cases", () => {
        beforeEach(async () => {
            await setupHook()
            await fundPools()
        })
        it("should set the last update timestamp", async () => {
            const firstTimestamp = await pool.lastPriceTimestamp()
            await pool.executePriceChange(1, 2)
            expect(await pool.lastPriceTimestamp()).to.be.greaterThan(
                firstTimestamp
            )
        })
        it("should send the fund movement fee to the fee holder", async () => {
            expect(await quoteToken.balanceOf(feeAddress)).to.eq(0)
            const newPrice = lastPrice * 2

            await pool.executePriceChange(lastPrice, newPrice)
            expect(await quoteToken.balanceOf(feeAddress)).to.eq(
                (await calculateFee(fee, amountCommitted)).mul(2)
            )
        })
    })
    describe("Exception cases", () => {
        beforeEach(setupHook)
        it("should only update the timestamp if the losing pool balance is zero", async () => {
            const oldTimestamp = await pool.lastPriceTimestamp()
            await pool.executePriceChange(lastPrice, 78000000)
            expect(await pool.lastPriceTimestamp()).to.be.greaterThan(
                oldTimestamp
            )
        })
    })
    describe("Movement to long pool", () => {
        beforeEach(async () => {
            await setupHook()
            await fundPools()
        })
        it("should update the short pair balance", async () => {
            expect(await pool.shortBalance()).to.eq(amountCommitted)
            // Increase price by 1 cent
            await pool.executePriceChange(
                lastPrice,
                ethers.BigNumber.from(lastPrice).add(1000000)
            )
            expect(await pool.shortBalance()).to.eq(
                ethers.BigNumber.from("1722730315330386595645")
            )
        })
        it("should update the long pair balance", async () => {
            expect(await pool.longBalance()).to.eq(
                ethers.utils.parseEther("2000")
            )
            // Increase price by 1 cent
            await pool.executePriceChange(
                lastPrice,
                ethers.BigNumber.from(lastPrice).add(1000000)
            )
            expect(await pool.longBalance()).to.eq(
                amountCommitted
                    .sub(await calculateFee(fee, amountCommitted))
                    .add(
                        amountCommitted.sub(
                            ethers.BigNumber.from("1722730315330386595645").add(
                                await calculateFee(fee, amountCommitted)
                            )
                        )
                    )
            )
        })
    })
    describe("Movement to short pool", () => {
        beforeEach(async () => {
            await setupHook()
            await fundPools()
        })
        it("should update the short pair balance", async () => {
            expect(await pool.shortBalance()).to.eq(
                ethers.utils.parseEther("2000")
            )
            // Increase price by 1 cent
            await pool.executePriceChange(
                lastPrice,
                ethers.BigNumber.from(lastPrice).sub(1000000)
            )
            expect(await pool.shortBalance()).to.eq(
                amountCommitted
                    .sub(await calculateFee(fee, amountCommitted))
                    .add(
                        amountCommitted.sub(
                            ethers.BigNumber.from("1719826919507855595287").add(
                                await calculateFee(fee, amountCommitted)
                            )
                        )
                    )
            )
        })
        it("should update the long pair balance", async () => {
            expect(await pool.longBalance()).to.eq(amountCommitted)
            // Increase price by 1 cent
            await pool.executePriceChange(
                lastPrice,
                ethers.BigNumber.from(lastPrice).sub(1000000)
            )
            expect(await pool.longBalance()).to.eq(
                ethers.BigNumber.from("1719826919507855595287")
            )
        })
    })
})
