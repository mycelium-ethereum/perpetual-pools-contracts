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
    POOL_CODE,
    SHORT_BURN,
    SHORT_MINT,
} from "../../constants"
import {
    deployPoolAndTokenContracts,
    getRandomInt,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
    getCurrentTotalCommit,
} from "../../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.BigNumber.from(DEFAULT_MINT_AMOUNT)
const feeAddress = generateRandomAddress()
const lastPrice = getRandomInt(99999999, 1)
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 2

describe("LeveragedPool - executeCommitment: Short Burn", () => {
    let token: TestToken
    let shortToken: ERC20
    let library: PoolSwapLibrary
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let commit: CommitEventArgs
    let poolCommitter: PoolCommitter

    describe("Short Burn", () => {
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
            shortToken = result.shortToken
            library = result.library
            poolCommitter = result.poolCommitter
            await token.approve(pool.address, amountMinted)
            commit = await createCommit(
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(lastPrice, lastPrice)
            await poolCommitter.claim(signers[0].address)

            await shortToken.approve(pool.address, amountCommitted)
            commit = await createCommit(
                poolCommitter,
                SHORT_BURN,
                amountCommitted
            )
        })
        it("should reduce the live short pool balance", async () => {
            expect(await pool.shortBalance()).to.eq(amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(lastPrice, lastPrice)
            expect(await pool.shortBalance()).to.eq(0)
        })
        it("should reduce the shadow short burn pool balance", async () => {
            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortBurnAmount
            ).to.eq(amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(lastPrice, 10)
            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortBurnAmount
            ).to.eq(0)
        })
        it("should transfer settlement tokens to the commit owner", async () => {
            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted.sub(amountCommitted)
            )
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(lastPrice, 10)
            await poolCommitter.claim(signers[0].address)
            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted
            )
        })
    })
})
