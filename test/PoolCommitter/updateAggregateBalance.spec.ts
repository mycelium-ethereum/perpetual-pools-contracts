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
} from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    DEFAULT_FEE,
    DEFAULT_MINT_AMOUNT,
    LONG_MINT,
    POOL_CODE,
} from "../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
} from "../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.BigNumber.from(DEFAULT_MINT_AMOUNT)
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 3300 // seconds
const fee = DEFAULT_FEE
const leverage = 2

describe("PoolCommitter - updateAggregateBalance", () => {
    let token: TestToken

    let maxIterations: number
    let lastCommitUpdateInterval: number
    let longToken: ERC20
    let poolCommitter: PoolCommitter
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let commit: CommitEventArgs
    let library: PoolSwapLibrary
    let l2Encoder: L2Encoder

    describe("Frontrunning interval : update interval ratio larger than MAX_ITERATIONS", () => {
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
            l2Encoder = result.l2Encoder
            signers = result.signers
            token = result.token
            library = result.library
            longToken = result.longToken
            poolCommitter = result.poolCommitter
            await pool.setKeeper(signers[0].address)
            await token.approve(pool.address, amountMinted)

            maxIterations = await poolCommitter.MAX_ITERATIONS()

            for (let i = 0; i < maxIterations; i++) {
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    [LONG_MINT],
                    amountCommitted
                )
                await timeout(updateInterval * 1000)
                await pool.poolUpkeep(9, 9)
            }

            const lastCommit = await createCommit(
                l2Encoder,
                poolCommitter,
                [LONG_MINT],
                amountCommitted
            )
            lastCommitUpdateInterval = lastCommit.appropriateUpdateIntervalId
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(9, 9)

            // Will only execute MAX_ITERATIONS commitments, leaving 1 unexecuted
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(9, 9)
            await timeout(frontRunningInterval * 1000)
            await pool.poolUpkeep(9, 9)
            await poolCommitter.claim(signers[0].address)
        })
        it("Should add long token balance as user's commitment results get aggregated", async () => {
            expect(await longToken.balanceOf(signers[0].address)).to.equal(
                amountCommitted.mul(maxIterations)
            )
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(9, 9)
            await poolCommitter.claim(signers[0].address)
            // Get the last one
            expect(await longToken.balanceOf(signers[0].address)).to.equal(
                amountCommitted.mul(maxIterations + 1)
            )
        })
        it("should not delete all unaggregated update interval IDs, but instead leave only the leftover ones in", async () => {
            const unaggregated = await poolCommitter.unAggregatedCommitments(
                signers[0].address,
                0
            )
            expect(unaggregated).to.equal(lastCommitUpdateInterval)
            // No reason string when accessing out of bounds in storage array
            await expect(
                poolCommitter.unAggregatedCommitments(signers[0].address, 1)
            ).to.be.reverted
        })
    })
})
