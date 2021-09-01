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
import { DEFAULT_MINT_AMOUNT, POOL_CODE } from "../../constants"
import {
    deployPoolAndTokenContracts,
    getRandomInt,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
} from "../../utilities"
import { BytesLike } from "ethers"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.BigNumber.from(DEFAULT_MINT_AMOUNT)
const feeAddress = generateRandomAddress()
const lastPrice = getRandomInt(99999999, 1)
const updateInterval = 2
const frontRunningInterval = 1 // seconds
const fee = "0x00000000000000000000000000000000"
const leverage = 2

describe("LeveragedPool - executeCommitment: Long Burn", () => {
    let token: TestToken

    let longToken: ERC20
    let poolCommitter: PoolCommitter
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let commit: CommitEventArgs
    let library: PoolSwapLibrary
    describe("Long Burn", () => {
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
            library = result.library
            longToken = result.longToken
            poolCommitter = result.poolCommitter
            await pool.setKeeper(signers[0].address)
            await token.approve(pool.address, amountMinted)
            commit = await createCommit(poolCommitter, [2], amountCommitted)
            await timeout(2000)
            await pool.poolUpkeep(9, 10)
            await longToken.approve(pool.address, amountCommitted)
            commit = await createCommit(poolCommitter, [3], amountCommitted)
        })
        it("should adjust the live long pool balance", async () => {
            expect(await pool.longBalance()).to.eq(amountCommitted)
            await timeout(2000)
            await pool.poolUpkeep(9, 10)
            expect(await pool.longBalance()).to.eq(0)
        })
        it("should reduce the shadow long burn pool balance", async () => {
            expect(await poolCommitter.shadowPools(commit.commitType)).to.eq(
                amountCommitted
            )
            await timeout(2000)
            await pool.poolUpkeep(9, 10)
            expect(await poolCommitter.shadowPools(commit.commitType)).to.eq(0)
        })
        it("should transfer quote tokens to the commit owner", async () => {
            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted.sub(amountCommitted)
            )
            await timeout(2000)
            await pool.poolUpkeep(9, 10)
            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted
            )
        })
    })
})
