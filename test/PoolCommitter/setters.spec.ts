import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    ERC20,
    LeveragedPool,
    PoolCommitter,
    PoolKeeper,
    PoolSwapLibrary,
    TestToken,
} from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    DEFAULT_FEE,
    DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
    DEFAULT_MIN_COMMIT_SIZE,
    POOL_CODE,
} from "../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
} from "../utilities"

import { ContractReceipt } from "ethers"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const feeAddress = generateRandomAddress()
const updateInterval = 2
const frontRunningInterval = 1
const fee = DEFAULT_FEE
const leverage = 1
const commitType = [0] // Short mint

describe("PoolCommitter - setters", () => {
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let token: TestToken
    let library: PoolSwapLibrary
    let shortToken: ERC20
    let longToken: ERC20
    let poolCommitter: PoolCommitter
    let poolKeeper: PoolKeeper
    let receipt: ContractReceipt

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
        signers = result.signers
        pool = result.pool
        token = result.token
        library = result.library
        poolCommitter = result.poolCommitter
        poolKeeper = result.poolKeeper
        await token.approve(pool.address, amountCommitted)
        receipt = await (
            await poolCommitter.commit(commitType, amountCommitted)
        ).wait()
    })

    context("setMaximumCommitQueueLength", () => {
        it("Should set maxmiumCommitQueueLength", async () => {
            // Signers[0] should be owner because that is owner of factory too
            await poolCommitter.setMaxCommitQueueLength(123)
            expect(await poolCommitter.maximumCommitQueueLength()).to.equal(123)
        })
        it("Should prevent unauthorised setting", async () => {
            // Signers[0] should be owner because that is owner of factory too
            await expect(
                poolCommitter
                    .connect(signers[1])
                    .setMaxCommitQueueLength(ethers.utils.parseEther("3000"))
            ).to.be.revertedWith("msg.sender not governance")
        })
        it("Should prevent setting it to 0", async () => {
            // Signers[0] should be owner because that is owner of factory too
            await expect(
                poolCommitter.setMaxCommitQueueLength(0)
            ).to.be.revertedWith("Commit queue must be > 0")
        })
    })

    context("setMinimumCommitSize", () => {
        it("Should set minimumCommitSize", async () => {
            // Signers[0] should be owner because that is owner of factory too
            await poolCommitter.setMinimumCommitSize(
                ethers.utils.parseEther("3000")
            )
            expect(await poolCommitter.minimumCommitSize()).to.equal(
                ethers.utils.parseEther("3000")
            )
        })
        it("Should prevent unauthorised setting", async () => {
            // Signers[0] should be owner because that is owner of factory too
            await expect(
                poolCommitter
                    .connect(signers[1])
                    .setMinimumCommitSize(ethers.utils.parseEther("3000"))
            ).to.be.revertedWith("msg.sender not governance")
        })
    })
})
