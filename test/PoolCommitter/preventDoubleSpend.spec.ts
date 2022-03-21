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
    deployPoolAndTokenContracts,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
} from "../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 2

describe("PoolCommitter - commit", () => {
    let token: TestToken
    let longToken: ERC20
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let library: PoolSwapLibrary
    let poolCommitter: PoolCommitter
    let l2Encoder: L2Encoder

    describe("Long token double spend attack", () => {
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
            poolCommitter = result.poolCommitter
            await pool.setKeeper(signers[0].address)
            token = result.token
            library = result.library
            longToken = result.longToken
            l2Encoder = result.l2Encoder
            await token.approve(pool.address, amountMinted)

            await token.transfer(signers[1].address, amountCommitted)
            await token.connect(signers[1]).approve(pool.address, amountMinted)

            await createCommit(l2Encoder, poolCommitter, LONG_MINT, amountCommitted, false, false, 0, signers[1])

            await createCommit(l2Encoder, poolCommitter, LONG_MINT, amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(10, 10)
            await poolCommitter.updateAggregateBalance(signers[0].address)
        })
        it("should prevent a double spend when you have unAggregated token burns", async () => {
            const maxIterations = await poolCommitter.MAX_ITERATIONS()
            // Add maxIterations + 1 burn commits, across as many update intervals, so the last one will not get aggregated when the user next gets their balance aggregated
            for (let i = 0; i < maxIterations + 1; i++) {
                await createCommit(l2Encoder, poolCommitter, LONG_BURN, 1, true)
                await timeout(updateInterval * 1000)
            }
            // The amount we have committed so far is 1 per commit * (maxIterations + 1)
            const amountBurntSoFar = maxIterations + 1
            // We should only be able to then burn `amountCommitted - amountBurntSoFar`
            await timeout(updateInterval * 1000)
            await expect(
                createCommit(l2Encoder, poolCommitter, LONG_BURN, amountCommitted.sub(amountBurntSoFar).add(1), true)
            ).to.be.reverted
        })
    })
    describe("Short token double spend attack", () => {
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
            poolCommitter = result.poolCommitter
            await pool.setKeeper(signers[0].address)
            token = result.token
            library = result.library
            longToken = result.longToken
            l2Encoder = result.l2Encoder
            await token.approve(pool.address, amountMinted)

            await token.transfer(signers[1].address, amountCommitted)
            await token.connect(signers[1]).approve(pool.address, amountMinted)

            await createCommit(l2Encoder, poolCommitter, SHORT_MINT, amountCommitted, false, false, 0, signers[1])

            await createCommit(l2Encoder, poolCommitter, SHORT_MINT, amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(10, 10)
            await poolCommitter.updateAggregateBalance(signers[0].address)
        })
        it("should prevent a double spend when you have unAggregated token burns", async () => {
            const maxIterations = await poolCommitter.MAX_ITERATIONS()
            // Add maxIterations + 1 burn commits, across as many update intervals, so the last one will not get aggregated when the user next gets their balance aggregated
            for (let i = 0; i < maxIterations + 1; i++) {
                await createCommit(l2Encoder, poolCommitter, SHORT_BURN, 1, true)
                await timeout(updateInterval * 1000)
            }
            // The amount we have committed so far is 1 per commit * (maxIterations + 1)
            const amountBurntSoFar = maxIterations + 1
            // We should only be able to then burn `amountCommitted - amountBurntSoFar`
            await timeout(updateInterval * 1000)
            await expect(
                createCommit(l2Encoder, poolCommitter, SHORT_BURN, amountCommitted.sub(amountBurntSoFar).add(1), true)
            ).to.be.reverted
        })
    })
})
