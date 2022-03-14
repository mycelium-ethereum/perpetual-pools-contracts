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
import { DEFAULT_FEE, LONG_MINT, POOL_CODE, SHORT_MINT } from "../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    timeout,
    getCurrentTotalCommit,
    getCurrentUserCommit,
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
const mintFee = ethers.utils.parseEther("0.01")
const mintFeeReciprocal = ethers.BigNumber.from("100")
const feeTaken = amountCommitted.div(mintFeeReciprocal) // amountCommitted / 100

describe("PoolCommitter - Mint commit with mint fee", () => {
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let token: TestToken
    let library: PoolSwapLibrary
    let shortToken: ERC20
    let longToken: ERC20
    let poolCommitter: PoolCommitter
    let poolKeeper: PoolKeeper

    context("Setting mint fee", async () => {
        context("mint fee too high", async () => {
            it("reverts", async () => {
                const result = await deployPoolAndTokenContracts(
                    POOL_CODE,
                    frontRunningInterval,
                    updateInterval,
                    leverage,
                    feeAddress,
                    fee,
                    0
                )
                const mintingFee = ethers.utils.parseEther("1.01")
                await expect(
                    result.poolCommitter.setMintingFee(mintingFee)
                ).to.be.revertedWith("Minting fee >= 100%")
            })
        })
        it("Updates mint fee", async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee,
                0
            )
            const mintingFee = ethers.utils.parseEther("0.992")
            await result.poolCommitter.setMintingFee(mintingFee)
            const resultantMintingFee =
                await result.library.convertDecimalToUInt(
                    await result.poolCommitter.mintingFee()
                )
            expect(resultantMintingFee).to.equal(mintingFee)
        })
    })

    context("Create SHORT_MINT commit", () => {
        let receipt: ContractReceipt
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee,
                mintFee
            )
            signers = result.signers
            pool = result.pool
            token = result.token
            library = result.library
            poolCommitter = result.poolCommitter
            poolKeeper = result.poolKeeper
            shortToken = result.shortToken
            await token.approve(pool.address, amountCommitted)
            receipt = await (
                await poolCommitter.commit(
                    SHORT_MINT,
                    amountCommitted,
                    false,
                    false
                )
            ).wait()
        })
        it("transfers all tokens to the pool", async () => {
            expect(await token.balanceOf(pool.address)).to.equal(
                amountCommitted
            )
        })

        it("Increases short side by fee amount", async () => {
            expect(await pool.shortBalance()).to.equal(feeTaken)
        })

        it("stores the amount committed minus the minting fee", async () => {
            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortMintSettlement
            ).to.equal(amountCommitted.sub(feeTaken))
            expect(
                (await getCurrentUserCommit(signers[0].address, poolCommitter))
                    .shortMintSettlement
            ).to.equal(amountCommitted.sub(feeTaken))
        })

        it("Updates aggregate balance", async () => {
            await timeout(updateInterval * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            expect(
                (await poolCommitter.getAggregateBalance(signers[0].address))
                    .shortTokens
            ).to.equal(amountCommitted.sub(feeTaken))
        })

        it("Updates wallet balance properly on claim", async () => {
            await timeout(updateInterval * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            await poolCommitter.claim(signers[0].address)
            expect(await shortToken.balanceOf(signers[0].address)).to.equal(
                amountCommitted.sub(feeTaken)
            )
        })
    })

    context("Create LONG_MINT commit", () => {
        let receipt: ContractReceipt
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee,
                mintFee
            )
            signers = result.signers
            pool = result.pool
            token = result.token
            library = result.library
            poolCommitter = result.poolCommitter
            poolKeeper = result.poolKeeper
            shortToken = result.shortToken
            longToken = result.longToken
            await token.approve(pool.address, amountCommitted)
            receipt = await (
                await poolCommitter.commit(
                    LONG_MINT,
                    amountCommitted,
                    false,
                    false
                )
            ).wait()
        })
        it("transfers all tokens to the pool", async () => {
            expect(await token.balanceOf(pool.address)).to.equal(
                amountCommitted
            )
        })

        it("Increases long side by fee amount", async () => {
            expect(await pool.longBalance()).to.equal(feeTaken)
        })

        it("stores the amount committed minus the minting fee", async () => {
            expect(
                (await getCurrentTotalCommit(poolCommitter)).longMintSettlement
            ).to.equal(amountCommitted.sub(feeTaken))
            expect(
                (await getCurrentUserCommit(signers[0].address, poolCommitter))
                    .longMintSettlement
            ).to.equal(amountCommitted.sub(feeTaken))
        })

        it("Updates aggregate balance", async () => {
            await timeout(updateInterval * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            expect(
                (await poolCommitter.getAggregateBalance(signers[0].address))
                    .longTokens
            ).to.equal(amountCommitted.sub(feeTaken))
        })

        it("Updates wallet balance properly on claim", async () => {
            await timeout(updateInterval * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            await poolCommitter.claim(signers[0].address)
            expect(await longToken.balanceOf(signers[0].address)).to.equal(
                amountCommitted.sub(feeTaken)
            )
        })
    })
})
