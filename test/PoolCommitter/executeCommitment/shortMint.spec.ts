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
import { DEFAULT_FEE, DEFAULT_MINT_AMOUNT, POOL_CODE } from "../../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
    getCurrentTotalCommit,
} from "../../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = DEFAULT_MINT_AMOUNT
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 2

describe("PoolCommitter - executeCommitment: Short Mint", () => {
    let token: TestToken
    let shortToken: ERC20
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let commit: CommitEventArgs
    let library: PoolSwapLibrary
    let poolCommitter: PoolCommitter
    let l2Encoder: L2Encoder

    describe("Short Mint", () => {
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
            l2Encoder = result.l2Encoder

            await pool.setKeeper(signers[0].address)
            token = result.token
            shortToken = result.shortToken
            library = result.library
            await token.approve(pool.address, amountMinted)
            commit = await createCommit(
                l2Encoder,
                poolCommitter,
                [0],
                amountCommitted
            )
        })
        it("should adjust the live short pool balance", async () => {
            expect(await pool.shortBalance()).to.eq(0)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(9, 10)
            expect(await pool.shortBalance()).to.eq(amountCommitted)
        })
        it("should reduce the shadow short mint pool balance", async () => {
            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortMintSettlement
            ).to.eq(amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(9, 10)
            expect(
                (await getCurrentTotalCommit(poolCommitter)).shortMintSettlement
            ).to.eq(0)
        })
        it("should mint short tokens", async () => {
            expect(await shortToken.balanceOf(signers[0].address)).to.eq(0)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(9, 10)
            await poolCommitter.claim(signers[0].address)
            expect(await shortToken.balanceOf(signers[0].address)).to.eq(
                amountCommitted
            )
        })
    })
})
