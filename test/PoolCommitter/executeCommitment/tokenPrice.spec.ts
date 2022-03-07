import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
} from "../../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    DEFAULT_FEE,
    DEFAULT_MINT_AMOUNT,
    LONG_BURN,
    LONG_MINT,
    SHORT_BURN,
    SHORT_MINT,
    POOL_CODE,
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
const updateInterval = 100
const frontRunningInterval = 50 // seconds
const fee = DEFAULT_FEE
const leverage = 2

describe("PoolCommitter - executeCommitment: Token Price", () => {
    let token: TestToken

    let poolCommitter: PoolCommitter
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    describe("Short Burn and mint", () => {
        it("Should account for burns allocated to future update intervals", async () => {
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
            await token.approve(pool.address, amountMinted)
            await createCommit(poolCommitter, [SHORT_MINT], amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(10, 10)
            // Before FR interval
            console.log(1)
            await createCommit(
                poolCommitter,
                [SHORT_BURN],
                amountCommitted.div(4),
                true
            )

            // After FR interval
            await timeout((updateInterval - frontRunningInterval / 2) * 1000)
            await createCommit(
                poolCommitter,
                [SHORT_BURN],
                amountCommitted.div(4),
                true
            )

            // Now first commit can be executed
            console.log((await token.balanceOf(signers[0].address)).toString())
            const balBefore = await token.balanceOf(signers[0].address)
            await timeout(frontRunningInterval * 1000)
            await pool.poolUpkeep(10, 10)
            await poolCommitter.claim(signers[0].address)
            console.log((await token.balanceOf(signers[0].address)).toString())
            const balAfter = await token.balanceOf(signers[0].address)
            expect(balAfter).to.equal(balBefore.add(amountCommitted.div(4)))
        })
    })
    describe("Long Burn and mint", () => {
        it.only("Should account for burns allocated to future update intervals", async () => {
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
            await token.approve(pool.address, amountMinted)
            await createCommit(poolCommitter, [LONG_MINT], amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(10, 10)
            // Before FR interval
            console.log(1)
            await createCommit(
                poolCommitter,
                [LONG_BURN],
                amountCommitted.div(4),
                true
            )

            // After FR interval
            await timeout((updateInterval - frontRunningInterval / 2) * 1000)
            await createCommit(
                poolCommitter,
                [LONG_BURN],
                amountCommitted.div(4),
                true
            )

            // Now first commit can be executed
            console.log((await token.balanceOf(signers[0].address)).toString())
            const balBefore = await token.balanceOf(signers[0].address)
            await timeout(frontRunningInterval * 1000)
            await pool.poolUpkeep(10, 10)
            await poolCommitter.claim(signers[0].address)
            console.log((await token.balanceOf(signers[0].address)).toString())
            const balAfter = await token.balanceOf(signers[0].address)
            expect(balAfter).to.equal(balBefore.add(amountCommitted.div(4)))
        })
    })
})
