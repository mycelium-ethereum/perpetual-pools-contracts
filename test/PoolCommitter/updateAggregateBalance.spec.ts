import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
} from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    DEFAULT_FEE,
    DEFAULT_MINT_AMOUNT,
    LONG_BURN,
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

    let longToken: ERC20
    let poolCommitter: PoolCommitter
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let commit: CommitEventArgs
    let library: PoolSwapLibrary
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
            signers = result.signers
            token = result.token
            library = result.library
            longToken = result.longToken
            poolCommitter = result.poolCommitter
            await pool.setKeeper(signers[0].address)
            await token.approve(pool.address, amountMinted)

            const maxIterations = await poolCommitter.MAX_ITERATIONS();

            for (let i = 0; i < maxIterations + 1; i++) {
                await createCommit(
                    poolCommitter,
                    [LONG_MINT],
                    amountCommitted
                )
                await timeout(updateInterval * 1000)
            }

            // Will only execute MAX_ITERATIONS commitments, leaving 1 unexecuted
            await pool.poolUpkeep(9, 9)
            console.log((await poolCommitter.unAggregatedCommitments(signers[0].address, 0)).toString())
            await pool.poolUpkeep(9, 9)
            console.log("WAHU")
            await poolCommitter.updateAggregateBalance(signers[0].address)
        })
        it.only("should not delete all unaggregated update interval IDs", async () => {
            const unaggregated = await poolCommitter.unAggregatedCommitments(signers[0].address, 0)
            console.log(unaggregated.toString())
            console.log((await poolCommitter.unAggregatedCommitments(signers[0].address, 1)).toString())
            console.log((await poolCommitter.unAggregatedCommitments(signers[0].address, 2)).toString())
            console.log((await poolCommitter.unAggregatedCommitments(signers[0].address, 3)).toString())
        })
    })
})
