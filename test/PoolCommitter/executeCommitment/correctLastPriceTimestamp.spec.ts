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
    LONG_MINT,
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
const amountMinted = ethers.BigNumber.from(DEFAULT_MINT_AMOUNT)
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 2

describe("PoolCommitter - executeCommitments: setting lastPriceTimestamp", () => {
    let token: TestToken
    let maxIterations: number
    let longToken: ERC20
    let poolCommitter: PoolCommitter
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let commit: CommitEventArgs
    let library: PoolSwapLibrary
    let l2Encoder: L2Encoder
    describe("Exceeding MAX_ITERATIONS", () => {
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee
            )
            l2Encoder = result.l2Encoder
            pool = result.pool
            signers = result.signers
            token = result.token
            library = result.library
            longToken = result.longToken
            poolCommitter = result.poolCommitter

            maxIterations = await poolCommitter.MAX_ITERATIONS()

            await pool.setKeeper(signers[0].address)
            await token.approve(pool.address, amountMinted)

            for (let i = 0; i < maxIterations + 6; i++) {
                commit = await createCommit(l2Encoder, poolCommitter, [LONG_MINT], 1)
                await timeout(updateInterval * 1000)
            }
        })

        it("should set lastPriceTimestamp to the last upkept update interval", async () => {
            const lastPriceTimestamp = await pool.lastPriceTimestamp()
            const expectedLastPriceTimestamp = lastPriceTimestamp.add(
                updateInterval * maxIterations
            )
            await pool.poolUpkeep(9, 10)

            const resultantLastPriceTimestamp = await pool.lastPriceTimestamp()
            expect(await pool.longBalance()).to.equal(maxIterations)
            expect(resultantLastPriceTimestamp).to.equal(
                expectedLastPriceTimestamp
            )
        })

        it("should allow instant subsequent upkeep", async () => {
            await pool.poolUpkeep(9, 10)
            await pool.poolUpkeep(9, 10)
        })
    })
})
