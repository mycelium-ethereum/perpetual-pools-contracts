import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    PoolSwapLibrary,
    LeveragedPool,
    TestToken,
    PoolCommitter,
    L2Encoder,
} from "../../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { DEFAULT_FEE, LONG_MINT, POOL_CODE, SHORT_MINT } from "../../constants"
import {
    getEventArgs,
    deployPoolAndTokenContracts,
    getRandomInt,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
    getCurrentTotalCommit,
} from "../../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const feeAddress = generateRandomAddress()
const lastPrice = getRandomInt(99999999, 1)
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 2
const commitType = LONG_MINT

describe("poolCommitter - executeCommitment: Basic test cases", () => {
    let token: TestToken
    let pool: LeveragedPool
    let library: PoolSwapLibrary
    let signers: SignerWithAddress[]
    let poolCommitter: PoolCommitter
    let l2Encoder: L2Encoder

    context("When committing during the frontRunningInterval", () => {
        it("Does not execute until the next update interval", async () => {
            const _updateInterval = 250
            const _frontRunningInterval = 100
            const elements = await deployPoolAndTokenContracts(
                POOL_CODE,
                _frontRunningInterval,
                _updateInterval,
                leverage,
                feeAddress,
                fee
            )
            signers = elements.signers
            pool = elements.pool
            const committer = elements.poolCommitter
            token = elements.token
            l2Encoder = elements.l2Encoder
            const shortToken = elements.shortToken
            await token.approve(pool.address, ethers.constants.MaxUint256)
            await pool.setKeeper(signers[0].address)
            // Wait until somewhere between `frontRunningInterval <-> updateInterval`
            await timeout((_updateInterval - _frontRunningInterval / 2) * 1000)
            await createCommit(
                l2Encoder,
                committer,
                SHORT_MINT,
                amountCommitted
            )

            const shortTokensSupplyBefore = await shortToken.totalSupply()
            // Now wait for updateInterval to pass
            await timeout(_updateInterval * 1000)
            await pool.poolUpkeep(lastPrice, lastPrice)
            const shortTokensSupplyAfter = await shortToken.totalSupply()
            expect(shortTokensSupplyAfter).to.equal(shortTokensSupplyBefore)
            await timeout(300 * 1000)
            await pool.poolUpkeep(lastPrice, lastPrice)
            const shortTokensSupplyAfterSecond = await shortToken.totalSupply()

            expect(shortTokensSupplyAfterSecond).to.be.gt(
                shortTokensSupplyAfter
            )
        })
    })

    describe("Revert cases", () => {
        before(async () => {
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
            poolCommitter = result.poolCommitter
        })
        it("should revert if the commitment is too new", async () => {
            await token.approve(pool.address, amountCommitted)
            await createCommit(
                l2Encoder,
                poolCommitter,
                commitType,
                amountCommitted
            )
            await expect(
                pool.poolUpkeep(lastPrice, lastPrice)
            ).to.be.rejectedWith(Error)
        })

        it("should revert if the commitment doesn't exist", async () => {
            await expect(
                pool.poolUpkeep(lastPrice, lastPrice)
            ).to.be.rejectedWith(Error)
        })
    })

    describe("Single commitment", () => {
        let commit: CommitEventArgs
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
            poolCommitter = result.poolCommitter

            await token.approve(pool.address, amountCommitted)
            commit = await createCommit(
                l2Encoder,
                poolCommitter,
                commitType,
                amountCommitted
            )
            await pool.setKeeper(signers[0].address)
        })

        it("should remove the commitment after execution", async () => {
            expect(
                (await getCurrentTotalCommit(poolCommitter)).longMintSettlement
            ).to.eq(amountCommitted)
            await timeout(updateInterval * 1000)
            await pool.poolUpkeep(9, 10)
            expect(
                (await getCurrentTotalCommit(poolCommitter)).longMintSettlement
            ).to.eq(0)
        })

        // TODO this can not get the ExecuteCommit event because it happens internally (not at top level)
        // Not sure how to account for this/test it
        it("should emit an event for commitment removal", async () => {
            await timeout(updateInterval * 1000)
            const receipt = await (await pool.poolUpkeep(9, 10)).wait()
            expect(getEventArgs(receipt, "ExecuteCommit")?.commitID).to.eq(
                commit.commitID
            )
        })
        it("should not allow anyone to execute a commitment", async () => {
            await timeout(updateInterval * 1000)
            await expect(
                pool.connect(signers[1]).poolUpkeep(9, 10)
            ).to.be.reverted
        })
    })
})
