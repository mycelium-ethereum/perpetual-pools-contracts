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
import { DEFAULT_FEE, LONG_MINT, POOL_CODE, SHORT_MINT } from "../../constants"
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
const amountMinted = ethers.utils.parseEther("100000")
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = ethers.utils.parseEther("0.1")
const changeInterval = ethers.utils.parseEther("0.5")
const leverage = 2

describe("PoolCommitter - mintingFee update", () => {
    let token: TestToken
    let longToken: ERC20
    let shortToken: ERC20
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let commit: CommitEventArgs
    let library: PoolSwapLibrary
    let poolCommitter: PoolCommitter
    let l2Encoder: L2Encoder

    describe("updateMintFee", async () => {
        beforeEach(async () => {
            const startMintingFee = 0
            const startBurningFee = 0
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee,
                startMintingFee,
                startBurningFee,
                0
            )
            pool = result.pool
            signers = result.signers
            poolCommitter = result.poolCommitter
            l2Encoder = result.l2Encoder
            await pool.setKeeper(signers[0].address)
            token = result.token
            library = result.library
            longToken = result.longToken
            shortToken = result.shortToken
            await token.approve(pool.address, amountMinted)
            commit = await createCommit(l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            commit = await createCommit(l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )
            await poolCommitter.setChangeInterval(changeInterval)
        })
        context("longTokenPrice * shortTokenPrice <= 1", async () => {
            context("longTokenPrice * shortTokenPrice < 1", async () => {
                it("Should increase mintingFee", async () => {
                    await timeout(updateInterval * 1000)
                    await pool.poolUpkeep(10, 10)

                    // second upkeep to pay fees (making price go below 1)
                    await timeout(updateInterval * 1000)
                    await pool.poolUpkeep(10, 10)

                    const mintingFeeAfter = (
                        await library.convertDecimalToUInt(
                            await poolCommitter.mintingFee()
                        )
                    ).toString()

                    // Should equal changeInterval * 2 because the fee gets incremented twice
                    expect(mintingFeeAfter).to.equal(changeInterval.mul(2))
                })
            })

            context("longTokenPrice * shortTokenPrice == 1", async () => {
                it("Should increase mintingFee if longTokenPrice * shortTokenPrice == 1", async () => {
                    await timeout(updateInterval * 1000)
                    await pool.poolUpkeep(10, 10)

                    const mintingFeeAfter = (
                        await library.convertDecimalToUInt(
                            await poolCommitter.mintingFee()
                        )
                    ).toString()

                    expect(mintingFeeAfter).to.equal(changeInterval)
                })
            })
        })

        context("longTokenPrice * shortTokenPrice > 1", async () => {
            it("Should decrease mintingFee", async () => {
                // Make a few commits to bring price above $1
                commit = await createCommit(l2Encoder,
                    poolCommitter,
                    LONG_MINT,
                    amountCommitted
                )
                commit = await createCommit(l2Encoder,
                    poolCommitter,
                    LONG_MINT,
                    amountCommitted
                )
                commit = await createCommit(l2Encoder,
                    poolCommitter,
                    SHORT_MINT,
                    amountCommitted
                )
                commit = await createCommit(l2Encoder,
                    poolCommitter,
                    SHORT_MINT,
                    amountCommitted
                )

                await timeout(updateInterval * 1000)
                await pool.poolUpkeep(10, 10)

                const mintingFeeAfter = (
                    await library.convertDecimalToUInt(
                        await poolCommitter.mintingFee()
                    )
                ).toString()

                expect(mintingFeeAfter).to.equal(changeInterval)
            })
        })
    })
})
