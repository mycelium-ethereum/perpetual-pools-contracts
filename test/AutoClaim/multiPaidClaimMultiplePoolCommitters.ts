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
    SHORT_MINT,
    POOL_CODE_2,
} from "../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
} from "../utilities"
import { BigNumberish } from "ethers"
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
const reward = ethers.utils.parseEther("103")

import { abi as ERC20Abi } from "../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json"
import { Receipt } from "hardhat-deploy/dist/types"

describe("AutoClaim - multiPaidClaimMultiplePoolCommitters", () => {
    let poolCommitter: PoolCommitter
    let token: TestToken
    let shortToken: ERC20
    let longToken: ERC20
    let pool: LeveragedPool
    let library: PoolSwapLibrary
    let autoClaim: AutoClaim
    let signers: SignerWithAddress[]
    let poolKeeper: PoolKeeper

    let poolCommitter2: any
    let pool2: any
    let shortToken2: any
    let longToken2: any

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
        await token.transfer(signers[1].address, amountCommitted.mul(2))
        await token.connect(signers[1]).approve(pool.address, amountMinted)

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
        poolCommitter2 = await ethers.getContractAt("PoolCommitter", commiter)

        let longTokenAddr = await pool.tokens(0)
        let shortTokenAddr = await pool.tokens(1)
        longToken2 = await ethers.getContractAt(ERC20Abi, longTokenAddr)
        shortToken2 = await ethers.getContractAt(ERC20Abi, shortTokenAddr)

        await token.approve(pool2.address, amountMinted)
    })

    context("When there is no claim", async () => {
        it("does nothing", async () => {
            const receipt = await (
                await autoClaim.paidClaim(
                    signers[0].address,
                    poolCommitter.address
                )
            ).wait()
            expect(receipt?.events?.length).to.equal(0)
        })
    })

    context("When there are claims, but all are still pending", async () => {
        it("does nothing", async () => {
            await createCommit(
                poolCommitter,
                LONG_MINT,
                amountCommitted,
                false,
                true,
                reward
            )
            await poolCommitter
                .connect(signers[1])
                .commit(LONG_MINT, amountCommitted, false, true, {
                    value: reward,
                })
            await createCommit(
                poolCommitter2,
                LONG_MINT,
                amountCommitted,
                false,
                true,
                reward
            )

            const users = [
                signers[0].address,
                signers[1].address,
                signers[0].address,
            ]
            const committers = [
                poolCommitter.address,
                poolCommitter.address,
                poolCommitter2.address,
            ]

            const receipt = await (
                await autoClaim.multiPaidClaimMultiplePoolCommitters(
                    users,
                    committers
                )
            ).wait()
            expect(receipt?.events?.length).to.equal(0)
        })
    })

    context("When there is a valid request to claim", async () => {
        let balanceBeforeClaim: BigNumberish
        let receipt
        beforeEach(async () => {
            await token.transfer(signers[1].address, amountCommitted.mul(2))
            await token.connect(signers[1]).approve(pool.address, amountMinted)

            await poolCommitter
                .connect(signers[1])
                .commit(LONG_MINT, amountCommitted, false, true, {
                    value: reward,
                })
            await timeout(updateInterval * 1000)
            await poolKeeper.performUpkeepMultiplePools([
                pool.address,
                pool2.address,
            ])

            await poolCommitter2
                .connect(signers[0])
                .commit(SHORT_MINT, amountCommitted, false, true, {
                    value: reward,
                })

            balanceBeforeClaim = await ethers.provider.getBalance(
                signers[0].address
            )

            const users = [signers[0].address, signers[1].address]
            const committers = [poolCommitter2.address, poolCommitter.address]

            receipt = await (
                await autoClaim.multiPaidClaimMultiplePoolCommitters(
                    users,
                    committers
                )
            ).wait()
        })
        it("Sends money", async () => {
            const balanceAfterClaim = await ethers.provider.getBalance(
                signers[0].address
            )
            expect(balanceBeforeClaim).to.be.lt(balanceAfterClaim)
        })
        it("Deletes request", async () => {
            const request = await autoClaim.claimRequests(
                signers[1].address,
                poolCommitter.address
            )
            expect(request.updateIntervalId).to.equal(0)
            expect(request.reward).to.equal(0)
        })
        it("Doesn't delete the request that was made too late", async () => {
            const request = await autoClaim.claimRequests(
                signers[0].address,
                poolCommitter2.address
            )
            expect(request.updateIntervalId).to.equal(
                await poolCommitter2.updateIntervalId()
            )
            expect(request.reward).to.equal(reward)
        })
        it("Claims", async () => {
            const longTokenBalance = await longToken.balanceOf(
                signers[1].address
            )
            expect(longTokenBalance).to.equal(amountCommitted)
        })
        it("Doesn't claim the one that was made too late", async () => {
            const shortTokenBalance = await shortToken2.balanceOf(
                signers[1].address
            )
            expect(shortTokenBalance).to.equal(0)
        })
    })

    context("When there are multiple valid requests to claim", async () => {
        let balanceBeforeClaim: BigNumberish
        let receipt: Receipt
        beforeEach(async () => {
            await token.transfer(signers[1].address, amountCommitted.mul(2))
            await token.connect(signers[1]).approve(pool.address, amountMinted)

            await poolCommitter
                .connect(signers[1])
                .commit(LONG_MINT, amountCommitted, false, true, {
                    value: reward,
                })
            await poolCommitter2
                .connect(signers[0])
                .commit(SHORT_MINT, amountCommitted, false, true, {
                    value: reward,
                })
            await timeout(updateInterval * 10000)
            await poolKeeper.performUpkeepMultiplePools([
                pool.address,
                pool2.address,
            ])

            await poolCommitter.commit(
                SHORT_MINT,
                amountCommitted,
                false,
                true,
                { value: reward }
            )

            balanceBeforeClaim = await ethers.provider.getBalance(
                signers[0].address
            )

            const users = [signers[0].address, signers[1].address]
            const committers = [poolCommitter2.address, poolCommitter.address]

            receipt = await (
                await autoClaim.multiPaidClaimMultiplePoolCommitters(
                    users,
                    committers
                )
            ).wait()
        })
        it("Sends money", async () => {
            const balanceAfterClaim = await ethers.provider.getBalance(
                signers[0].address
            )
            expect(balanceBeforeClaim).to.be.lt(balanceAfterClaim)
        })
        it("Deletes request", async () => {
            const request = await autoClaim.claimRequests(
                signers[1].address,
                poolCommitter.address
            )
            expect(request.updateIntervalId).to.equal(0)
            expect(request.reward).to.equal(0)
        })
        it("Claims", async () => {
            const longTokenBalance = await longToken.balanceOf(
                signers[1].address
            )
            expect(longTokenBalance).to.equal(amountCommitted)
        })
        it("Claims the right amount of requests", async () => {
            const events = receipt?.events
            expect(events?.length).to.be.gt(0)
            if (!events) {
                // Just to get the for loop to compile due to potential of undefined
                return
            }
            let count = 0
            for (let i of events) {
                if (i.event == "PaidRequestExecution") {
                    count++
                }
            }

            //because 2 requests were made in time to be executed
            expect(count).to.equal(2)
        })
    })
})
