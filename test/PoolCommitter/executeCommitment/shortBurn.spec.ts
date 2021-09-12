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
    DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
    DEFAULT_MINT_AMOUNT,
    DEFAULT_MIN_COMMIT_SIZE,
    POOL_CODE,
} from "../../constants"
import {
    deployPoolAndTokenContracts,
    getRandomInt,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
} from "../../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.BigNumber.from(DEFAULT_MINT_AMOUNT)
const feeAddress = generateRandomAddress()
const lastPrice = getRandomInt(99999999, 1)
const updateInterval = 2
const frontRunningInterval = 1 // seconds
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
                DEFAULT_MIN_COMMIT_SIZE,
                DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
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
            commit = await createCommit(poolCommitter, [0], amountCommitted)
            await timeout(2000)
            await pool.setKeeper(signers[0].address)
            await pool.poolUpkeep(lastPrice, 10)

            await shortToken.approve(pool.address, amountCommitted)
            commit = await createCommit(poolCommitter, [1], amountCommitted)
        })
        it("should reduce the live short pool balance", async () => {
            expect(await pool.shortBalance()).to.eq(amountCommitted)
            await timeout(2000)
            await pool.poolUpkeep(lastPrice, 10)
            expect(await pool.shortBalance()).to.eq(0)
        })
        it("should reduce the shadow short burn pool balance", async () => {
            expect(await poolCommitter.shadowPools(commit.commitType)).to.eq(
                amountCommitted
            )
            await timeout(2000)
            await pool.poolUpkeep(lastPrice, 10)
            expect(await poolCommitter.shadowPools(commit.commitType)).to.eq(0)
        })
        it("should transfer quote tokens to the commit owner", async () => {
            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted.sub(amountCommitted)
            )
            await timeout(2000)
            await pool.poolUpkeep(lastPrice, 10)
            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted
            )
        })
    })
})
