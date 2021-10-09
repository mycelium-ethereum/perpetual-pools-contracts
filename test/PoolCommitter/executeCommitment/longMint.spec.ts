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
    DEFAULT_MIN_COMMIT_SIZE,
    POOL_CODE,
} from "../../constants"
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
const updateInterval = 2
const frontRunningInterval = 1 // seconds
const fee = DEFAULT_FEE
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
                leverage,
                DEFAULT_MIN_COMMIT_SIZE,
                DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
                feeAddress,
                fee
            )
            pool = result.pool
            signers = result.signers
            poolCommitter = result.poolCommitter
            await pool.setKeeper(signers[0].address)
            token = result.token
            library = result.library
            longToken = result.longToken
            await token.approve(pool.address, amountMinted)
            console.log(1)
            commit = await createCommit(poolCommitter, [2], amountCommitted)
            console.log(2)
        })
        it("should adjust the live long pool balance", async () => {
            expect(await pool.longBalance()).to.eq(0)
            await timeout(2000)
            await pool.poolUpkeep(9, 10)
            expect(await pool.longBalance()).to.eq(amountCommitted)
        })
        it("should mint long pair tokens", async () => {
            expect(await longToken.balanceOf(signers[0].address)).to.eq(0)
            await timeout(2000)
            await pool.poolUpkeep(9, 10)
            expect(
                (await poolCommitter.getAggregateBalance(signers[0].address))[0]
            ).to.eq(amountCommitted)
        })
    })
})
