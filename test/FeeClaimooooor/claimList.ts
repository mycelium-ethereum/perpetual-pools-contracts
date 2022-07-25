import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { deployMultiplePools } from "./deployMultiplePools"
import {
    FeeClaimooooor,
    FeeClaimooooor__factory,
    L2Encoder,
    LeveragedPool,
    PoolCommitter,
    PoolFactory,
    PoolKeeper,
    TestToken,
} from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { DEFAULT_FEE, POOL_CODE, SHORT_BURN, SHORT_MINT } from "../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    timeout,
    createCommit,
} from "../utilities"
import { Contract } from "ethers"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const feeAddress = generateRandomAddress()
// Update interval and frontrunning interval are in seconds
const updateInterval = 2000
const frontRunningInterval = 1000
const fee = DEFAULT_FEE
const leverage = 1
const burnFee = ethers.utils.parseEther("0.01")

describe.only("FeeClaimooooor - claimList", () => {
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let token: TestToken
    let poolCommitter: PoolCommitter
    let poolKeeper: PoolKeeper
    let l2Encoder: L2Encoder
    let feeClaimooooor: FeeClaimooooor
    let factory: PoolFactory

    context("Single pool", () => {
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee,
                0,
                burnFee
            )
            signers = result.signers
            pool = result.pool
            token = result.token
            poolCommitter = result.poolCommitter
            poolKeeper = result.poolKeeper
            l2Encoder = result.l2Encoder
            await poolKeeper.setGasPrice("0")
            await token.approve(pool.address, amountCommitted)
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_BURN,
                amountCommitted,
                true
            )
            const FeeClaimooooorFactory = (await ethers.getContractFactory(
                "FeeClaimooooor",
                signers[0]
            )) as FeeClaimooooor__factory
            feeClaimooooor = await FeeClaimooooorFactory.deploy(
                result.factory.address
            )
            await feeClaimooooor.deployed()
        })
        it("claims", async () => {
            const primaryBalanceBefore = await token.balanceOf(feeAddress)
            const secondaryBalanceBefore = await token.balanceOf(
                signers[0].address
            )
            const secondaryFeeAmount = await pool.secondaryFees()
            const primaryFeeAmount = await pool.primaryFees()

            await feeClaimooooor.claimList([pool.address])

            const primaryBalanceAfter = await token.balanceOf(feeAddress)
            const secondaryBalanceAfter = await token.balanceOf(
                signers[0].address
            )

            expect(primaryBalanceAfter).to.equal(
                primaryBalanceBefore.add(primaryFeeAmount)
            )
            expect(secondaryBalanceAfter).to.equal(
                secondaryBalanceBefore.add(secondaryFeeAmount)
            )
        })
    })

    context("Multiple pools", () => {
        beforeEach(async () => {
            const result = await deployMultiplePools()
            token = result.token
            factory = result.factory
            l2Encoder = result.l2Encoder
            poolKeeper = result.poolKeeper

            const FeeClaimooooorFactory = (await ethers.getContractFactory(
                "FeeClaimooooor",
                signers[0]
            )) as FeeClaimooooor__factory
            feeClaimooooor = await FeeClaimooooorFactory.deploy(factory.address)
            await feeClaimooooor.deployed()
        })
        it("claims", async () => {
            const pool1: Contract = await ethers.getContractAt(
                "LeveragedPool",
                await factory.pools(0)
            )
            const pool2: Contract = await ethers.getContractAt(
                "LeveragedPool",
                await factory.pools(1)
            )
            const committer1: Contract = await ethers.getContractAt(
                "PoolCommitter",
                await pool1.poolCommitter()
            )
            const committer2: Contract = await ethers.getContractAt(
                "PoolCommitter",
                await pool2.poolCommitter()
            )

            const encodedArgs = await l2Encoder.encodeCommitParams(
                ethers.utils.parseEther("10000"),
                SHORT_MINT,
                false,
                false
            )
            await token.approve(
                pool1.address,
                ethers.utils.parseEther("100000")
            )
            await token.approve(
                pool2.address,
                ethers.utils.parseEther("100000")
            )
            await committer1.commit(encodedArgs)
            await committer2.commit(encodedArgs)
            await poolKeeper.performUpkeepMultiplePools([
                pool1.address,
                pool2.address,
            ])

            const primaryBalanceBefore = await token.balanceOf(feeAddress)
            const secondaryBalanceBefore = await token.balanceOf(
                signers[0].address
            )
            const secondaryFeeAmount = (await pool1.secondaryFees()).add(
                await pool2.secondaryFees()
            )
            const primaryFeeAmount = (await pool1.primaryFees()).add(
                await pool2.primaryFees()
            )

            await feeClaimooooor.claimList([pool1.address, pool2.address])

            const primaryBalanceAfter = await token.balanceOf(feeAddress)
            const secondaryBalanceAfter = await token.balanceOf(
                signers[0].address
            )

            expect(primaryBalanceAfter).to.equal(
                primaryBalanceBefore.add(primaryFeeAmount)
            )
            expect(secondaryBalanceAfter).to.equal(
                secondaryBalanceBefore.add(secondaryFeeAmount)
            )
        })
    })
})
