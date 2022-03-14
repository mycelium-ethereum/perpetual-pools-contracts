import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { LeveragedPool, TestToken, PoolCommitter } from "../../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    DEFAULT_FEE,
    DEFAULT_MINT_AMOUNT,
    LONG_BURN,
    LONG_MINT,
    POOL_CODE,
    SHORT_BURN,
    SHORT_MINT,
} from "../../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    createCommit,
    timeout,
} from "../../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.BigNumber.from(DEFAULT_MINT_AMOUNT)
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 2

describe("PoolCommitter - Upkeeping with multiple update intervals pending", () => {
    let token: TestToken

    let poolCommitter: PoolCommitter
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    describe("Short Burn when there are multiple update intervals waiting to be upkept", () => {
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
            signers = result.signers
            token = result.token
            poolCommitter = result.poolCommitter

            await pool.setKeeper(signers[0].address)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(10, 10)

            await token.approve(pool.address, amountMinted)
            await token.transfer(signers[1].address, amountCommitted.mul(2))
            await token.connect(signers[1]).approve(pool.address, amountMinted)
            await createCommit(poolCommitter, [SHORT_MINT], amountCommitted)
            await poolCommitter
                .connect(signers[1])
                .commit(SHORT_MINT, amountCommitted, false, false)

            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(10, 10)

            await poolCommitter.claim(signers[0].address)
            await poolCommitter.connect(signers[1]).claim(signers[1].address)

            await createCommit(
                poolCommitter,
                [SHORT_BURN],
                amountCommitted.div(4)
            )

            await timeout(updateInterval * 1000)

            await poolCommitter
                .connect(signers[1])
                .commit(SHORT_BURN, amountCommitted.div(4), false, false)

            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(10, 10)
        })
        it("Should give the same pool tokens to both", async () => {
            const balanceBefore0 = await token.balanceOf(signers[0].address)
            const balanceBefore1 = await token.balanceOf(signers[1].address)

            await poolCommitter.claim(signers[0].address)
            await poolCommitter.connect(signers[1]).claim(signers[1].address)

            const balanceAfter0 = await token.balanceOf(signers[0].address)
            const balanceAfter1 = await token.balanceOf(signers[1].address)

            const diff0 = balanceAfter0.sub(balanceBefore0)
            const diff1 = balanceAfter1.sub(balanceBefore1)

            expect(diff0).to.equal(diff1)
        })
    })
    describe("Long Burn when there are multiple update intervals waiting to be upkept", () => {
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
            signers = result.signers
            token = result.token
            poolCommitter = result.poolCommitter

            await pool.setKeeper(signers[0].address)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(10, 10)

            await token.approve(pool.address, amountMinted)
            await token.transfer(signers[1].address, amountCommitted.mul(2))
            await token.connect(signers[1]).approve(pool.address, amountMinted)
            await createCommit(poolCommitter, [LONG_MINT], amountCommitted)
            await poolCommitter
                .connect(signers[1])
                .commit(LONG_MINT, amountCommitted, false, false)

            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(10, 10)

            await poolCommitter.claim(signers[0].address)
            await poolCommitter.connect(signers[1]).claim(signers[1].address)

            await createCommit(
                poolCommitter,
                [LONG_BURN],
                amountCommitted.div(4)
            )

            await timeout(updateInterval * 1000)

            await poolCommitter
                .connect(signers[1])
                .commit(LONG_BURN, amountCommitted.div(4), false, false)

            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(10, 10)
        })
        it("Should give the same pool tokens to both", async () => {
            const balanceBefore0 = await token.balanceOf(signers[0].address)
            const balanceBefore1 = await token.balanceOf(signers[1].address)

            await poolCommitter.claim(signers[0].address)
            await poolCommitter.connect(signers[1]).claim(signers[1].address)

            const balanceAfter0 = await token.balanceOf(signers[0].address)
            const balanceAfter1 = await token.balanceOf(signers[1].address)

            const diff0 = balanceAfter0.sub(balanceBefore0)
            const diff1 = balanceAfter1.sub(balanceBefore1)

            expect(diff0).to.equal(diff1)
        })
    })
})
