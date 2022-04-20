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
import { DEFAULT_FEE, LONG_MINT, POOL_CODE } from "../../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
} from "../../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 2

describe("PoolCommitter - executeCommitment: Long Mint", () => {
    let token: TestToken
    let longToken: ERC20
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let commit: CommitEventArgs
    let library: PoolSwapLibrary
    let poolCommitter: PoolCommitter
    let l2Encoder: L2Encoder

    describe("Long Mint", () => {
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
            l2Encoder = result.l2Encoder
            longToken = result.longToken
            await token.approve(pool.address, amountMinted)
            commit = await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
        })
        it("should adjust the live long pool balance", async () => {
            expect(await pool.longBalance()).to.eq(0)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(9, 10)
            expect(await pool.longBalance()).to.eq(amountCommitted)
        })
        it("should add long pool tokens to aggregate balance", async () => {
            expect(await longToken.balanceOf(signers[0].address)).to.eq(0)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(9, 10)
            expect(
                (await poolCommitter.getAggregateBalance(signers[0].address))
                    .longTokens
            ).to.eq(amountCommitted)
        })
        it("should mint short tokens", async () => {
            expect(await longToken.balanceOf(signers[0].address)).to.eq(0)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(9, 10)
            await poolCommitter.claim(signers[0].address)
            expect(await longToken.balanceOf(signers[0].address)).to.eq(
                amountCommitted
            )
        })
    })
})
