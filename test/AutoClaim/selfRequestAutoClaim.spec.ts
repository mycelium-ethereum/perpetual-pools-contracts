import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
    AutoClaim,
    PoolKeeper,
} from "../../types"

import {
    POOL_CODE,
    DEFAULT_FEE,
    LONG_MINT,
    LONG_BURN,
    SHORT_MINT,
} from "../constants"
import {
    deployPoolAndTokenContracts,
    getRandomInt,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
} from "../utilities"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 1
const reward = 123123

describe("AutoClaim - selfRequestAutoClaim", () => {
    let poolCommitter: PoolCommitter
    let token: TestToken
    let shortToken: ERC20
    let longToken: ERC20
    let pool: LeveragedPool
    let library: PoolSwapLibrary
    let autoClaim: AutoClaim
    let signers: SignerWithAddress[]
    let poolKeeper: PoolKeeper

    const commits: CommitEventArgs[] | undefined = []
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
        library = result.library
        poolCommitter = result.poolCommitter
        autoClaim = result.autoClaim
        signers = result.signers
        poolKeeper = result.poolKeeper

        token = result.token
        shortToken = result.shortToken
        longToken = result.longToken

        await token.approve(pool.address, amountMinted)
    })

    context("When no pending request already exists", async () => {
        it("adds a new one", async () => {
            await autoClaim.selfRequestAutoClaim(poolCommitter.address, { value: reward })
            const request = await autoClaim.claimRequests(
                signers[0].address,
                poolCommitter.address
            )
            expect(request.reward).to.equal(reward)
            expect(request.updateIntervalId).to.equal(
                await poolCommitter.updateIntervalId()
            )
        })
    })

    context.only(
        "When a pending request already exists, but is not yet ready to be claimed",
        async () => {
            it("increments reward", async () => {
                await autoClaim.selfRequestAutoClaim(poolCommitter.address, { value: reward })
                await autoClaim.selfRequestAutoClaim(poolCommitter.address, { value: reward })
                const request = await autoClaim.claimRequests(
                    signers[0].address,
                    poolCommitter.address
                )
                expect(request.reward).to.equal(reward * 2) // 2x rewards
                expect(request.updateIntervalId).to.equal(
                    await poolCommitter.updateIntervalId()
                )
            })
        }
    )

    context.only(
        "When a pending request already exists, and is ready to be claimed",
        async () => {
            it("Resets the pending request and executes previous one", async () => {
                const secondReward = reward - 50
                await token.transfer(signers[1].address, amountCommitted.mul(2))
                await token
                    .connect(signers[1])
                    .approve(pool.address, amountMinted)
                await autoClaim.connect(signers[1]).selfRequestAutoClaim(poolCommitter.address, { value: reward })
                await timeout(updateInterval * 1000)
                await poolKeeper.performUpkeepSinglePool(pool.address)

                const balanceBefore = await ethers.provider.getBalance(
                    signers[1].address
                )

                const receipt = await (
                    await autoClaim.connect(signers[1]).selfRequestAutoClaim(poolCommitter.address, { value: secondReward })
                ).wait()
                const gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice)

                const request = await autoClaim.claimRequests(
                    signers[1].address,
                    poolCommitter.address
                )

                const balanceAfter = await ethers.provider.getBalance(
                    signers[1].address
                )

                expect(request.reward).to.equal(secondReward)
                expect(request.updateIntervalId).to.equal(
                    await poolCommitter.updateIntervalId()
                )

                // Got paid reward. Paid reward - 50 plus gas on second commit
                expect(balanceAfter.sub(balanceBefore).add(gasCost)).to.equal(
                    reward - secondReward
                )
            })
        }
    )
})
