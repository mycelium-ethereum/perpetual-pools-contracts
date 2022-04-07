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
} from "../../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    DEFAULT_FEE,
    DEFAULT_MINT_AMOUNT,
    LONG_BURN,
    LONG_BURN_THEN_MINT,
    LONG_MINT,
    POOL_CODE,
    SHORT_MINT,
} from "../../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
    getCurrentTotalCommit,
} from "../../utilities"
import { BigNumber } from "ethers"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.BigNumber.from(DEFAULT_MINT_AMOUNT)
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const burnFee = ethers.utils.parseEther("0.01")
const mintFee = ethers.utils.parseEther("0.01")
const mintFeeReciprocal = ethers.BigNumber.from("100")
const burnFeeReciprocal = ethers.BigNumber.from("100")
const leverage = 2

describe("PoolCommitter - executeCommitment: Long Burn into instant short mint", () => {
    let token: TestToken

    let longToken: ERC20
    let shortToken: ERC20
    let poolCommitter: PoolCommitter
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let commit: CommitEventArgs
    let library: PoolSwapLibrary
    let l2Encoder: L2Encoder
    let mintFeeAmount: BigNumber
    let longBurnShortMintFee: BigNumber
    beforeEach(async () => {
        const result = await deployPoolAndTokenContracts(
            POOL_CODE,
            frontRunningInterval,
            updateInterval,
            leverage,
            feeAddress,
            fee,
            0,
            burnFee
        )
        pool = result.pool
        signers = result.signers
        token = result.token
        library = result.library
        longToken = result.longToken
        shortToken = result.shortToken
        poolCommitter = result.poolCommitter
        l2Encoder = result.l2Encoder
        await pool.setKeeper(signers[0].address)
        await token.approve(pool.address, amountMinted)
        commit = await createCommit(
            l2Encoder,
            poolCommitter,
            [LONG_MINT],
            amountCommitted
        )

        await poolCommitter.setMintingFee(mintFee)

        // Burn fee taken out, then mint fee taken out
        mintFeeAmount = amountCommitted
            .sub(amountCommitted.div(burnFeeReciprocal))
            .div(mintFeeReciprocal)
        // The expected fee is the burn fee + the minting fee on the other side. Given that the mint fee == burn fee, we can expect a fee equal to the (amountCommitted / BurnFee) + (amountCommittedAfterBurnFee / mintFee)
        longBurnShortMintFee = amountCommitted
            .div(burnFeeReciprocal)
            .add(mintFeeAmount)

        await timeout(updateInterval * 1000)
        await pool.poolUpkeep(9, 10)
        await poolCommitter.claim(signers[0].address)
        await longToken.approve(pool.address, amountCommitted)
        commit = await createCommit(
            l2Encoder,
            poolCommitter,
            [LONG_BURN_THEN_MINT],
            amountCommitted
        )
    })
    it("should mint short pool tokens", async () => {
        expect(await shortToken.totalSupply()).to.eq(0)
        await timeout(updateInterval * 1000)
        await pool.poolUpkeep(9, 9)
        expect(await shortToken.totalSupply()).to.eq(
            amountCommitted.sub(longBurnShortMintFee)
        )
    })
    it("should adjust the live short pool balance", async () => {
        expect(await pool.longBalance()).to.eq(amountCommitted)
        await timeout(updateInterval * 1000)
        await pool.poolUpkeep(9, 9)
        expect(await pool.shortBalance()).to.eq(
            amountCommitted.sub(longBurnShortMintFee)
        )
    })
    it("should adjust the live long pool balance", async () => {
        expect(await pool.longBalance()).to.eq(amountCommitted)
        await timeout(updateInterval * 1000)
        await pool.poolUpkeep(9, 9)
        expect(await pool.longBalance()).to.eq(0)
    })
    it("should reduce the shadow long burn short mint pool balance", async () => {
        expect(
            (await getCurrentTotalCommit(poolCommitter))
                .longBurnShortMintPoolTokens
        ).to.equal(amountCommitted)
        await timeout(updateInterval * 1000)
        await pool.poolUpkeep(9, 9)
        expect(
            await (
                await getCurrentTotalCommit(poolCommitter)
            ).longBurnShortMintPoolTokens
        ).to.eq(0)
    })
    it("should not transfer settlement tokens to the commit owner, because we are instantly minting", async () => {
        expect(await token.balanceOf(signers[0].address)).to.eq(
            amountMinted.sub(amountCommitted)
        )
        await timeout(updateInterval * 1000)
        await pool.poolUpkeep(9, 9)
        const tokensBefore = await token.balanceOf(signers[0].address)
        await poolCommitter.claim(signers[0].address)
        expect(
            (await token.balanceOf(signers[0].address)).sub(tokensBefore)
        ).to.eq(0)
    })

    it("should transfer short tokens to the commit owner", async () => {
        expect(await shortToken.balanceOf(signers[0].address)).to.eq(0)
        await timeout(updateInterval * 1000)
        await pool.poolUpkeep(9, 9)
        await poolCommitter.claim(signers[0].address)
        expect(await shortToken.balanceOf(signers[0].address)).to.eq(
            amountCommitted.sub(longBurnShortMintFee)
        )
    })
})
