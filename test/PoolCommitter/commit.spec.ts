import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    ERC20,
    LeveragedPool,
    PoolCommitter,
    PoolSwapLibrary,
    TestToken,
} from "../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { POOL_CODE } from "../constants"
import {
    getEventArgs,
    deployPoolAndTokenContracts,
    generateRandomAddress,
    getRandomInt,
    timeout,
} from "../utilities"

import { ContractReceipt } from "ethers"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const lastPrice = getRandomInt(99999999, 1)
const updateInterval = 2
const frontRunningInterval = 1
const fee = "0x00000000000000000000000000000000"
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

    describe("Create commit", () => {
        let receipt: ContractReceipt
        before(async () => {
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
            await token.approve(pool.address, amountCommitted)
            receipt = await (
                await poolCommitter.commit(commitType, amountCommitted)
            ).wait()
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
            expect(
                (await poolCommitter.commitIDCounter()).eq(
                    ethers.BigNumber.from(1)
                )
            ).to.eq(true)
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
