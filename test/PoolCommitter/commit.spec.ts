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
    DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
    DEFAULT_MIN_COMMIT_SIZE,
    POOL_CODE,
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
const updateInterval = 2
const frontRunningInterval = 1
const fee = DEFAULT_FEE
const leverage = 1
const commitType = [0] // Short mint

describe("LeveragedPool - commit", () => {
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let token: TestToken
    let library: PoolSwapLibrary
    let shortToken: ERC20
    let longToken: ERC20
    let poolCommitter: PoolCommitter
    let poolKeeper: PoolKeeper

    describe("Create commit", () => {
        let receipt: ContractReceipt
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
            signers = result.signers
            pool = result.pool
            token = result.token
            library = result.library
            poolCommitter = result.poolCommitter
            poolKeeper = result.poolKeeper
            await token.approve(pool.address, amountCommitted)
            receipt = await (
                await poolCommitter.commit(commitType, amountCommitted)
            ).wait()
        })
        it("should allow burn commits that are just the right size", async () => {
            const minimumCommitAmount = ethers.utils.parseEther("250")
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                minimumCommitAmount,
                DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
                feeAddress,
                fee
            )
            poolCommitter = result.poolCommitter

            await token.transfer(signers[1].address, amountCommitted.mul(5))

            await token.approve(result.pool.address, amountCommitted.mul(5))
            await token
                .connect(signers[1])
                .approve(result.pool.address, amountCommitted.mul(2))

            await poolCommitter.commit(2, amountCommitted.mul(2))
            await poolCommitter.connect(signers[1]).commit(2, amountCommitted)

            await timeout(updateInterval * 1000 + 1000)
            await result.poolKeeper.performUpkeepSinglePool(result.pool.address)

            // validAmount is calculated from rearranging the below and solving for amount:
            // longBalance / (longPoolTotalSupply + longBurnShadowPool) * amount > minimumCommitAmount
            // Where longBurnShadowPool is the shadowPools[CommitType.LongBurn] before call + amount
            // and longBalance = ~5990
            // longPoolTokenSupply = amountCommitted * 3 = 6000
            // minimumCommitAmount = 250
            // Which gives you the inequality x > 250 * ((6000 + amount) / 5990.55)
            const validAmount = ethers.utils.parseEther("261.299")

            const epsilon = ethers.utils.parseEther("0.1")
            const tx = result.poolCommitter.commit(
                [3],
                validAmount.sub(epsilon)
            )
            await expect(tx).to.be.revertedWith("Amount less than minimum")
            await result.poolCommitter.commit([3], validAmount.add(epsilon))
        })
        it("should disallow long burn commits that are too small", async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                ethers.utils.parseEther("1000"),
                DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
                feeAddress,
                fee
            )
            poolCommitter = result.poolCommitter
            await token.approve(pool.address, amountCommitted)
            // Commit with half the amount of the minimum, with a LONG BURN
            const tx = poolCommitter.commit([3], ethers.utils.parseEther("500"))
            await expect(tx).to.be.revertedWith("Amount less than minimum")
        })
        it("should disallow long burn commits that are too small, with non 1:1 ratios", async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                ethers.utils.parseEther("1000"),
                DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
                feeAddress,
                fee
            )
            poolCommitter = result.poolCommitter
            await token.approve(
                pool.address,
                ethers.utils.parseEther("1000000")
            )
            await poolCommitter.commit([0], ethers.utils.parseEther("2000"))
            await poolCommitter.commit([2], ethers.utils.parseEther("1000"))
            await timeout((updateInterval + 1) * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            expect(await poolCommitter.currentCommitQueueLength()).to.equal(0)
            // Commit with half the amount of the minimum, with a LONG BURN
            const tx = poolCommitter.commit([3], ethers.utils.parseEther("600"))
            await expect(tx).to.be.revertedWith("Amount less than minimum")
        })
        it("should disallow short burn commits that are too small, with non 1:1 ratios", async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                ethers.utils.parseEther("1000"),
                DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
                feeAddress,
                fee
            )
            poolCommitter = result.poolCommitter
            await token.approve(
                pool.address,
                ethers.utils.parseEther("1000000")
            )
            await poolCommitter.commit([0], ethers.utils.parseEther("2000"))
            await poolCommitter.commit([2], ethers.utils.parseEther("1000"))
            await timeout((updateInterval + 1) * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            // Commit with half the amount of the minimum, with a SHORT BURN
            const tx = poolCommitter.commit([1], ethers.utils.parseEther("600"))
            await expect(tx).to.be.revertedWith("Amount less than minimum")
        })
        it("should disallow short burn commits that are too small", async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                ethers.utils.parseEther("1000"),
                DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
                feeAddress,
                fee
            )
            poolCommitter = result.poolCommitter
            await token.approve(pool.address, amountCommitted)
            // Commit with half the amount of the minimum, with a SHORT BURN
            const tx = poolCommitter.commit([1], ethers.utils.parseEther("500"))
            await expect(tx).to.be.revertedWith("Amount less than minimum")
        })
        it("should disallow mint commits that are too small", async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                ethers.utils.parseEther("1000"),
                DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
                feeAddress,
                fee
            )
            poolCommitter = result.poolCommitter
            await token.approve(pool.address, amountCommitted)
            // Commit with half the amount of the minimum
            const tx = poolCommitter.commit(
                commitType,
                ethers.utils.parseEther("500")
            )
            await expect(tx).to.be.revertedWith("Amount less than minimum")
        })
        it("should disallow too many commits", async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                DEFAULT_MIN_COMMIT_SIZE,
                3,
                feeAddress,
                fee
            )
            poolCommitter = result.poolCommitter
            await token.approve(pool.address, amountCommitted)
            // Commit 3 times, then the 4th should revert
            await poolCommitter.commit(
                commitType,
                ethers.utils.parseEther("500")
            )
            await poolCommitter.commit(
                commitType,
                ethers.utils.parseEther("500")
            )
            await poolCommitter.commit(
                commitType,
                ethers.utils.parseEther("500")
            )
            expect(await poolCommitter.currentCommitQueueLength()).to.equal(3)
            expect(
                poolCommitter.commit(commitType, ethers.utils.parseEther("500"))
            ).to.be.revertedWith("Too many commits in interval")
        })
        it("should create a commit entry", async () => {
            expect(
                (
                    await poolCommitter.commits(
                        getEventArgs(receipt, "CreateCommit")?.commitID
                    )
                ).created
            ).to.not.eq(0)
        })
        it("should increment the id counter", async () => {
            expect(await poolCommitter.commitIDCounter()).to.equal(1)
        })
        it("should set the amount committed", async () => {
            expect(
                (
                    await poolCommitter.commits(
                        getEventArgs(receipt, "CreateCommit")?.commitID
                    )
                ).amount
            ).to.eq(amountCommitted)
        })
        it("should allocate a unique ID for each request", async () => {
            await token.approve(pool.address, amountCommitted)
            const secondCommit = await (
                await poolCommitter.commit(commitType, amountCommitted)
            ).wait()
            expect(getEventArgs(receipt, "CreateCommit")?.commitID).to.not.eq(
                getEventArgs(secondCommit, "CreateCommit")?.commitID
            )
        })

        it("should set a timestamp for each commit", async () => {
            expect(
                (
                    await poolCommitter.commits(
                        getEventArgs(receipt, "CreateCommit")?.commitID
                    )
                ).created
            ).to.not.eq(0)
        })

        it("should set the commit's owner", async () => {
            expect(
                (
                    await poolCommitter.commits(
                        getEventArgs(receipt, "CreateCommit")?.commitID
                    )
                ).owner
            ).to.eq(signers[0].address)
        })

        it("should set the commit type", async () => {
            expect(
                (
                    await poolCommitter.commits(
                        getEventArgs(receipt, "CreateCommit")?.commitID
                    )
                ).commitType
            ).to.eq(commitType[0])
        })

        it("should emit an event with details of the commit", async () => {
            expect(getEventArgs(receipt, "CreateCommit")?.commitType).to.eq(
                commitType[0]
            )
            expect(getEventArgs(receipt, "CreateCommit")?.amount).to.eq(
                amountCommitted
            )
            expect(getEventArgs(receipt, "CreateCommit")?.commitID).to.equal(
                ethers.BigNumber.from(0)
            )
        })
    })

    describe("Shadow balances", () => {
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
            signers = result.signers
            pool = result.pool
            token = result.token
            library = result.library
            poolCommitter = result.poolCommitter
            await token.approve(pool.address, amountMinted)
        })
        it("should update the shadow short mint balance for short mint commits", async () => {
            expect(await poolCommitter.shadowPools([0])).to.eq(0)
            await poolCommitter.commit([0], amountCommitted)
            expect(await poolCommitter.shadowPools([0])).to.eq(amountCommitted)
        })

        it("should update the shadow short burn balance for short burn commits", async () => {
            const receipt = await (
                await poolCommitter.commit([0], amountCommitted)
            ).wait()
            await timeout(2000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect(await poolCommitter.shadowPools([1])).to.eq(0)
            await poolCommitter.commit([1], amountCommitted)
            expect((await poolCommitter.shadowPools([1])).toHexString()).to.eq(
                amountCommitted.toHexString()
            )
        })

        it("should update the shadow long mint balance for long mint commits", async () => {
            expect(await poolCommitter.shadowPools([2])).to.eq(0)
            await poolCommitter.commit([2], amountCommitted)

            expect(await poolCommitter.shadowPools([2])).to.eq(amountCommitted)
        })

        it("should update the shadow long burn balance for long burn commits", async () => {
            const receipt = await (
                await poolCommitter.commit([2], amountCommitted)
            ).wait()
            await timeout(2000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect(await poolCommitter.shadowPools([2])).to.eq(0)
            await poolCommitter.commit([3], amountCommitted)
            expect((await poolCommitter.shadowPools([3])).toHexString()).to.eq(
                amountCommitted.toHexString()
            )
        })
    })

    // todo: Figure out where we want quote tokens to sit. Adjust these tests accordingly
    // currently it expects quote tokens to get transferred to the commiter, not the pool
    describe("Token Transfers", () => {
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
                await poolCommitter.commit([0], amountCommitted)
            ).wait()
            await timeout(2000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect((await token.balanceOf(pool.address)).toHexString()).to.eq(
                amountCommitted.toHexString()
            )
            await poolCommitter.commit([1], amountCommitted)

            expect((await token.balanceOf(pool.address)).toHexString()).to.eq(
                amountCommitted.toHexString()
            )
        })
        it("should not require a quote token transfer for long burn commits", async () => {
            const receipt = await (
                await poolCommitter.commit([2], amountCommitted)
            ).wait()
            await timeout(2000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)
            expect((await token.balanceOf(pool.address)).toHexString()).to.eq(
                amountCommitted.toHexString()
            )
            await poolCommitter.commit([3], amountCommitted)
            expect((await token.balanceOf(pool.address)).toHexString()).to.eq(
                amountCommitted.toHexString()
            )
        })
        it("should burn the user's short pair tokens for short burn commits", async () => {
            // Acquire pool tokens
            const receipt = await (
                await poolCommitter.commit([0], amountCommitted)
            ).wait()
            await timeout(2000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect(
                (await shortToken.balanceOf(signers[0].address)).toHexString()
            ).to.eq(amountCommitted.toHexString())
            await poolCommitter.commit([1], amountCommitted)
            expect(await shortToken.balanceOf(signers[0].address)).to.eq(0)
        })
        it("should burn the user's long pair tokens for long burn commits", async () => {
            // Acquire pool tokens
            const receipt = await (
                await poolCommitter.commit([2], amountCommitted)
            ).wait()
            await timeout(2000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(1, 2)

            expect(
                (await longToken.balanceOf(signers[0].address)).toHexString()
            ).to.eq(amountCommitted.toHexString())
            await poolCommitter.commit([3], amountCommitted)
            expect(await longToken.balanceOf(signers[0].address)).to.eq(0)
        })
        it("should transfer the user's quote tokens into the pool for long mint commits", async () => {
            expect(await token.balanceOf(pool.address)).to.eq(0)
            await poolCommitter.commit([2], amountCommitted)
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })

        it("should transfer the user's quote tokens into the pool for short mint commits", async () => {
            expect(await token.balanceOf(pool.address)).to.eq(0)
            await poolCommitter.commit([0], amountCommitted)
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })
    })
})
