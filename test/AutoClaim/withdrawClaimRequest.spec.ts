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

import { POOL_CODE, DEFAULT_FEE, SHORT_MINT, POOL_CODE_2 } from "../constants"
import {
    deployPoolAndTokenContracts,
    getRandomInt,
    generateRandomAddress,
    CommitEventArgs,
    timeout,
} from "../utilities"
import { BigNumber, BigNumberish, ContractReceipt } from "ethers"
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
const reward = ethers.utils.parseEther("100")

describe("AutoClaim - withdrawClaimRequest", () => {
    let poolCommitter: PoolCommitter
    let token: TestToken
    let shortToken: ERC20
    let longToken: ERC20
    let pool: LeveragedPool
    let library: PoolSwapLibrary
    let autoClaim: AutoClaim
    let signers: SignerWithAddress[]
    let poolKeeper: PoolKeeper
    let result: any

    const commits: CommitEventArgs[] | undefined = []
    beforeEach(async () => {
        result = await deployPoolAndTokenContracts(
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

    context("When there are no pending requests", async () => {
        it("does nothing", async () => {
            const receipt = await (
                await autoClaim.withdrawClaimRequest(poolCommitter.address)
            ).wait()
            expect(receipt?.events?.length).to.equal(0)
        })
    })
    context(
        "When there is a pending request that is not ready to be claimed",
        async () => {
            let balanceBefore: BigNumberish
            beforeEach(async () => {
                await poolCommitter.commit(
                    SHORT_MINT,
                    amountCommitted,
                    false,
                    true,
                    { value: reward }
                )
                balanceBefore = await ethers.provider.getBalance(
                    signers[0].address
                )
                await autoClaim.withdrawClaimRequest(poolCommitter.address)
            })
            it("Sends money back", async () => {
                const balanceAfter = await ethers.provider.getBalance(
                    signers[0].address
                )
                expect(balanceAfter).to.be.gt(balanceBefore)
            })
            it("Deletes request", async () => {
                const request = await autoClaim.claimRequests(
                    signers[0].address,
                    poolCommitter.address
                )
                expect(request.updateIntervalId).to.equal(0)
                expect(request.reward).to.equal(0)
            })
        }
    )
    context(
        "When there are multiple pending claim requests on a single pool Committer",
        async () => {
            let balanceBefore: BigNumber
            let receipt: ContractReceipt
            beforeEach(async () => {
                await poolCommitter.commit(
                    SHORT_MINT,
                    amountCommitted,
                    false,
                    true,
                    { value: reward }
                )
                await poolCommitter.commit(
                    SHORT_MINT,
                    amountCommitted,
                    false,
                    true,
                    { value: reward }
                )
                await timeout(updateInterval * 1000)
                await poolKeeper.performUpkeepSinglePool(pool.address)
                balanceBefore = await ethers.provider.getBalance(
                    signers[0].address
                )
                receipt = await (
                    await autoClaim.withdrawClaimRequest(poolCommitter.address)
                ).wait()
            })
            it("Sends all money back", async () => {
                const gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice)
                const balanceAfter = await ethers.provider.getBalance(
                    signers[0].address
                )
                expect(balanceAfter).to.eq(
                    balanceBefore.add(reward.mul(2)).sub(gasCost)
                )
            })
            it("Deletes request", async () => {
                const request = await autoClaim.claimRequests(
                    signers[0].address,
                    poolCommitter.address
                )
                expect(request.updateIntervalId).to.equal(0)
                expect(request.reward).to.equal(0)
            })
        }
    )
    context(
        "When there are multiple pending claim requests across multiple pool Committers",
        async () => {
            let balanceBefore: BigNumber
            let pool2: any
            let poolCommitter2: any
            let receipt: ContractReceipt
            beforeEach(async () => {
                // Deploy second pool
                // deploy the pool using the factory, not separately
                const deployParams = {
                    poolName: POOL_CODE_2,
                    frontRunningInterval: frontRunningInterval,
                    updateInterval: updateInterval,
                    leverageAmount: leverage + 1, // Change to make unique
                    settlementToken: token.address,
                    oracleWrapper: result.oracleWrapper.address,
                    settlementEthOracle: result.settlementEthOracle.address,
                    feeController: signers[0].address,
                    mintingFee: 0,
                    burningFee: 0,
                    changeInterval: 0,
                }

                await result.factory.deployPool(deployParams)

                const poolAddress = await result.factory.pools(1)
                pool2 = await ethers.getContractAt("LeveragedPool", poolAddress)

                let commiter = await pool2.poolCommitter()
                poolCommitter2 = await ethers.getContractAt(
                    "PoolCommitter",
                    commiter
                )

                await token.approve(pool2.address, amountMinted)

                await poolCommitter.commit(
                    SHORT_MINT,
                    amountCommitted,
                    false,
                    true,
                    { value: reward }
                )
                await poolCommitter2.commit(
                    SHORT_MINT,
                    amountCommitted,
                    false,
                    true,
                    { value: reward }
                )

                await timeout(updateInterval * 1000)
                await poolKeeper.performUpkeepMultiplePools([
                    pool.address,
                    pool2.address,
                ])
                balanceBefore = await ethers.provider.getBalance(
                    signers[0].address
                )
                receipt = await (
                    await autoClaim.withdrawClaimRequest(poolCommitter.address)
                ).wait()
            })
            it("Sends the right amount of money back", async () => {
                const gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice)
                const balanceAfter = await ethers.provider.getBalance(
                    signers[0].address
                )
                expect(balanceAfter).to.eq(
                    balanceBefore.add(reward).sub(gasCost)
                )
            })
            it("Deletes request", async () => {
                const request = await autoClaim.claimRequests(
                    signers[0].address,
                    poolCommitter.address
                )
                expect(request.updateIntervalId).to.equal(0)
                expect(request.reward).to.equal(0)
            })
            it("Keeps the one that was not withdrawn", async () => {
                const request = await autoClaim.claimRequests(
                    signers[0].address,
                    poolCommitter2.address
                )
                expect(request.updateIntervalId).to.equal(
                    (await poolCommitter2.updateIntervalId()).sub(1)
                )
                expect(request.reward).to.equal(reward)
            })
        }
    )
})
