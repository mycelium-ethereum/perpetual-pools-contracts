import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
} from "../../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { POOL_CODE } from "../../constants"
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
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const lastPrice = getRandomInt(99999999, 1)
const updateInterval = 2
const frontRunningInterval = 1 // seconds
const fee = "0x00000000000000000000000000000000"
const leverage = 2

describe("LeveragedPool - executeCommitment: Long Mint", () => {
    let token: TestToken
    let longToken: ERC20
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let commit: CommitEventArgs
    let library: PoolSwapLibrary
    let poolCommitter: PoolCommitter

    describe("Long Mint", () => {
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                fee,
                leverage,
                feeAddress
            )
            pool = result.pool
            signers = result.signers
            poolCommitter = result.poolCommitter
            await pool.setKeeper(signers[0].address)
            token = result.token
            library = result.library
            longToken = result.longToken
            await token.approve(pool.address, amountMinted)
            commit = await createCommit(poolCommitter, [2], amountCommitted)
        })
        it("should adjust the live long pool balance", async () => {
            expect(await pool.longBalance()).to.eq(0)
            await timeout(2000)
            await pool.poolUpkeep(9, 10)
            expect(await pool.longBalance()).to.eq(amountCommitted)
        })
        it("should reduce the shadow long mint pool balance", async () => {
            expect(await poolCommitter.shadowPools(commit.commitType)).to.eq(
                amountCommitted
            )
            await timeout(2000)
            await pool.poolUpkeep(9, 10)
            expect(await poolCommitter.shadowPools(commit.commitType)).to.eq(0)
        })
        it("should mint long pair tokens", async () => {
            expect(await longToken.balanceOf(signers[0].address)).to.eq(0)
            await timeout(2000)
            await pool.poolUpkeep(9, 10)
            expect(await longToken.balanceOf(signers[0].address)).to.eq(
                amountCommitted
            )
        })
    })
})
