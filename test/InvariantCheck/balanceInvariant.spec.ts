import { ethers } from "hardhat"
import chai from "chai"
const { expect } = chai
import chaiAsPromised from "chai-as-promised"
import {
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
    InvariantCheck,
    LeveragedPoolBalanceDrainMock,
    PoolKeeper,
    LeveragedPoolBalanceDrainMock__factory,
} from "../../types"

import { POOL_CODE, DEFAULT_FEE, LONG_MINT, SHORT_MINT } from "../constants"
import {
    generateRandomAddress,
    createCommit,
    deployMockPool,
    timeout,
} from "../utilities"
chai.use(chaiAsPromised)

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 1

describe("InvariantCheck - balanceInvariant", () => {
    let poolCommitter: PoolCommitter
    let token: TestToken
    let invariantCheck: InvariantCheck
    let shortToken: ERC20
    let longToken: ERC20
    let pool: LeveragedPoolBalanceDrainMock
    let poolKeeper: PoolKeeper
    let library: PoolSwapLibrary

    context("Pool not made by factory", async () => {
        it("Reverts due to not being valid pool", async () => {
            const signers = await ethers.getSigners()
            const result = await deployMockPool(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee
            )
            library = result.library
            const oracleWrapper = result.oracleWrapper
            const settlementEthOracle = result.settlementEthOracle
            const quoteToken = result.token.address
            const long = result.longToken
            const short = result.shortToken
            const invariantCheck = result.invariantCheck
            poolCommitter = result.poolCommitter

            // Deploy a fake pool
            const leveragedPoolFactory = (await ethers.getContractFactory(
                "LeveragedPoolBalanceDrainMock",
                {
                    signer: signers[0],
                    libraries: { PoolSwapLibrary: library.address },
                }
            )) as LeveragedPoolBalanceDrainMock__factory
            const pool = await leveragedPoolFactory.deploy()
            await pool.deployed()
            await await pool.initialize({
                _owner: signers[0].address,
                _keeper: generateRandomAddress(),
                _oracleWrapper: oracleWrapper.address,
                _settlementEthOracle: settlementEthOracle.address,
                _longToken: long.address,
                _shortToken: short.address,
                _poolCommitter: poolCommitter.address,
                _poolName: POOL_CODE,
                _frontRunningInterval: frontRunningInterval,
                _updateInterval: updateInterval,
                _fee: fee,
                _leverageAmount: leverage,
                _feeAddress: feeAddress,
                _secondaryFeeAddress: feeAddress,
                _quoteToken: quoteToken,
                _invariantCheckContract: invariantCheck.address,
                _secondaryFeeSplitPercent: 10,
            })

            await result.token.approve(result.pool.address, amountMinted)

            // Long mint commit
            await createCommit(poolCommitter, LONG_MINT, amountCommitted)
            // short mint commit
            await createCommit(poolCommitter, SHORT_MINT, amountCommitted)

            await expect(
                invariantCheck.checkInvariants(pool.address)
            ).to.be.revertedWith("Pool is invalid")
        })
    })
    context("Pool funds getting drained", async () => {
        beforeEach(async () => {
            const result = await deployMockPool(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee
            )
            pool = result.pool
            poolKeeper = result.poolKeeper
            library = result.library
            poolCommitter = result.poolCommitter
            invariantCheck = result.invariantCheck

            token = result.token
            shortToken = result.shortToken
            longToken = result.longToken

            await token.approve(pool.address, amountMinted)

            // Long mint commit
            await createCommit(poolCommitter, LONG_MINT, amountCommitted)
            // short mint commit
            await createCommit(poolCommitter, SHORT_MINT, amountCommitted)
        })

        it("Pauses contracts", async () => {
            await pool.drainPool(1)
            let pendingCommits = await poolCommitter.getPendingCommits()
            let totalMostRecentCommit = pendingCommits[0]
            const shortMintAmountBefore = totalMostRecentCommit.shortMintAmount
            const balanceBefore = await token.balanceOf(pool.address)
            const longMintAmountBefore = totalMostRecentCommit.longMintAmount

            // Creating a commit reverts, since pools is drained
            await expect(
                createCommit(poolCommitter, SHORT_MINT, amountCommitted)
            ).to.be.revertedWith("Pool is paused")

            // Performing upkeep does not work
            await timeout(updateInterval * 2000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            pendingCommits = await poolCommitter.getPendingCommits()
            totalMostRecentCommit = pendingCommits[0]
            const shortMintAmountAfter = totalMostRecentCommit.shortMintAmount
            const balanceAfter = await token.balanceOf(pool.address)
            let longMintAmountAfter = totalMostRecentCommit.longMintAmount
            expect(shortMintAmountAfter).to.equal(shortMintAmountBefore)
            expect(longMintAmountAfter).to.equal(longMintAmountBefore)
            expect(balanceAfter).to.equal(balanceBefore)
        })
        it("Doesn't allow the contracts to get unpaused (Needs governance to unpause)", async () => {
            await pool.drainPool(1)
            await invariantCheck.checkInvariants(pool.address)
            expect(await pool.paused()).to.equal(true)
            expect(await poolCommitter.paused()).to.equal(true)
            await token.transfer(pool.address, 123)
            await invariantCheck.checkInvariants(pool.address)
            expect(await pool.paused()).to.equal(true)
            expect(await poolCommitter.paused()).to.equal(true)
        })
        it("Once paused, can manually unpause as governance", async () => {
            await pool.drainPool(1)
            await invariantCheck.checkInvariants(pool.address)
            expect(await pool.paused()).to.equal(true)
            expect(await poolCommitter.paused()).to.equal(true)
            await pool.unpause()
            await poolCommitter.unpause()
            expect(await pool.paused()).to.equal(false)
            expect(await poolCommitter.paused()).to.equal(false)
        })
        it("Once paused, can not unpause if not governance", async () => {
            const signers = await ethers.getSigners()

            await pool.drainPool(1)
            await invariantCheck.checkInvariants(pool.address)
            expect(await pool.paused()).to.equal(true)
            expect(await poolCommitter.paused()).to.equal(true)

            await expect(pool.connect(signers[1]).unpause()).to.be.revertedWith(
                "msg.sender not governance"
            )
            await expect(
                poolCommitter.connect(signers[1]).unpause()
            ).to.be.revertedWith("msg.sender not governance")
            expect(await pool.paused()).to.equal(true)
            expect(await poolCommitter.paused()).to.equal(true)
        })
    })
})
