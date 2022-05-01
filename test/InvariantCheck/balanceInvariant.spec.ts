import { ethers } from "hardhat"
import chai from "chai"
const { expect } = chai
import chaiAsPromised from "chai-as-promised"
import {
    TestToken,
    PoolSwapLibrary,
    PoolCommitter,
    InvariantCheck,
    LeveragedPoolBalanceDrainMock,
    PoolKeeper,
    LeveragedPoolBalanceDrainMock__factory,
    L2Encoder,
} from "../../types"

import { POOL_CODE, DEFAULT_FEE, LONG_MINT, SHORT_MINT } from "../constants"
import {
    generateRandomAddress,
    createCommit,
    deployMockPool,
    timeout,
} from "../utilities"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
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
    let pool: LeveragedPoolBalanceDrainMock
    let library: PoolSwapLibrary
    let signers: SignerWithAddress[]
    let l2Encoder: L2Encoder

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
            l2Encoder = result.l2Encoder
            const oracleWrapper = result.oracleWrapper
            const settlementEthOracle = result.settlementEthOracle
            const settlementToken = result.token.address
            const long = result.longToken
            const short = result.shortToken
            const invariantCheck = result.invariantCheck
            const keeperRewards = result.keeperRewards
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
                _invariantCheck: invariantCheck.address,
                _leverageAmount: leverage,
                _feeAddress: feeAddress,
                _secondaryFeeAddress: feeAddress,
                _settlementToken: settlementToken,
                _secondaryFeeSplitPercent: 10,
            })

            await result.token.approve(result.pool.address, amountMinted)

            // Long mint commit
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            // short mint commit
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )

            await expect(
                invariantCheck.checkInvariants(pool.address)
            ).to.be.revertedWith("Pool is invalid")
        })
    })
    context(
        "Pool funds getting drained with large frontrunning interval",
        async () => {
            beforeEach(async () => {
                const largeFrontRunningInterval = updateInterval * 7
                const result = await deployMockPool(
                    POOL_CODE,
                    largeFrontRunningInterval,
                    updateInterval,
                    leverage,
                    feeAddress,
                    fee
                )
                pool = result.pool
                library = result.library
                poolCommitter = result.poolCommitter
                invariantCheck = result.invariantCheck
                signers = result.signers

                token = result.token

                await token.approve(pool.address, amountMinted.mul(10000))

                // Long mint commit
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    LONG_MINT,
                    amountCommitted
                )

                await timeout(updateInterval * 1000)
                // short mint commit
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_MINT,
                    amountCommitted
                )
                await timeout(updateInterval * 1000)
                // short mint commit
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_MINT,
                    amountCommitted
                )
                await timeout(updateInterval * 1000)
                // short mint commit
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_MINT,
                    amountCommitted
                )
                await timeout(updateInterval * 1000)
                // short mint commit
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_MINT,
                    amountCommitted
                )
                await timeout(updateInterval * 1000)
                // short mint commit
                await createCommit(
                    l2Encoder,
                    poolCommitter,
                    SHORT_MINT,
                    amountCommitted
                )
            })

            it("Pauses contracts", async () => {
                await pool.drainPool(1)

                await invariantCheck.checkInvariants(pool.address)

                // Performing upkeep does not work
                await timeout(updateInterval * 2000)

                await pool.setKeeper(signers[0].address)
                await expect(pool.poolUpkeep(10, 10)).to.be.reverted
            })
        }
    )

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
            library = result.library
            poolCommitter = result.poolCommitter
            invariantCheck = result.invariantCheck

            token = result.token

            await token.approve(pool.address, amountMinted)

            // Long mint commit
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            // short mint commit
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )
        })

        it("Pauses contracts", async () => {
            await pool.drainPool(1)
            await invariantCheck.checkInvariants(pool.address)
            expect(await pool.paused()).to.equal(true)
            expect(await poolCommitter.paused()).to.equal(true)
        })
        it("Doesn't allow the contracts to get unpaused (Needs governance to unpause)", async () => {
            await pool.drainPool(1)
            await invariantCheck.checkInvariants(pool.address)
            await token.transfer(pool.address, 123)
            await invariantCheck.checkInvariants(pool.address)
            expect(await pool.paused()).to.equal(true)
            expect(await poolCommitter.paused()).to.equal(true)
        })
        it("Once paused, can manually unpause as governance", async () => {
            await pool.drainPool(1)
            await invariantCheck.checkInvariants(pool.address)
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

            await expect(pool.connect(signers[1]).unpause()).to.be.reverted
            await expect(
                poolCommitter.connect(signers[1]).unpause()
            ).to.be.reverted
            expect(await pool.paused()).to.equal(true)
            expect(await poolCommitter.paused()).to.equal(true)
        })
    })
})
