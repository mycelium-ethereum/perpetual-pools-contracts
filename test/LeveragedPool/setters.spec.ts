import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { ethers } from "hardhat"
import { LeveragedPool, PoolKeeper } from "../../types"
import { DEFAULT_FEE, POOL_CODE } from "../constants"
import { deployPoolAndTokenContracts } from "../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

describe("LeveragedPool - setters", async () => {
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    let keeper: PoolKeeper

    beforeEach(async () => {
        signers = await ethers.getSigners()
        const result = await deployPoolAndTokenContracts(
            POOL_CODE,
            2, // frontRunningInterval
            5, // updateInterval
            1,
            signers[0].address,
            DEFAULT_FEE
        )
        pool = result.pool
        keeper = result.poolKeeper
    })

    context("updateFeeAddress", async () => {
        it("should set fee address", async () => {
            await pool.updateFeeAddress(signers[1].address)
            expect(await pool.feeAddress()).to.eq(signers[1].address)
        })
        it("should prevent unauthorized access", async () => {
            await pool.updateFeeAddress(signers[1].address)
            await expect(
                pool.connect(signers[2]).updateFeeAddress(signers[2].address)
            ).to.be.reverted
        })
    })

    context("setKeeper", async () => {
        it("should set the keeper address", async () => {
            expect(await pool.keeper()).to.eq(keeper.address)
            await pool.setKeeper(signers[1].address)
            expect(await pool.keeper()).to.eq(signers[1].address)
        })
        it("should prevent unauthorized access", async () => {
            await pool.setKeeper(signers[1].address)
            await expect(
                pool.connect(signers[2]).setKeeper(signers[2].address)
            ).to.be.reverted
        })
    })

    context("transferGovernance", async () => {
        it("should set the provisional governance address", async () => {
            await pool.transferGovernance(signers[1].address)
            expect(await pool.provisionalGovernance()).to.eq(signers[1].address)
        })
        it("should prevent unauthorized access", async () => {
            await pool.transferGovernance(signers[1].address)
            await expect(
                pool.connect(signers[2]).transferGovernance(signers[2].address)
            ).to.be.rejected
        })
    })

    describe("claimGovernance", async () => {
        context(
            "When governance transfer is in progress and called by provisional governor",
            async () => {
                it("Sets the actual governance address to the provisional governance address", async () => {
                    /* start governance transfer */
                    await pool.transferGovernance(signers[1].address)

                    /* claim governance */
                    await pool.connect(signers[1]).claimGovernance()

                    expect(await pool.governance()).to.be.eq(signers[1].address)
                })

                it("Sets the governance transfer flag to false", async () => {
                    /* start governance transfer */
                    await pool.transferGovernance(signers[1].address)

                    /* claim governance */
                    await pool.connect(signers[1]).claimGovernance()

                    expect(await pool.governanceTransferInProgress()).to.be.eq(
                        false
                    )
                })
            }
        )

        context(
            "When governance transfer is not in progress and called by provisional governor",
            async () => {
                it("Reverts", async () => {
                    /* attempt to claim governance */
                    await expect(
                        pool.connect(signers[1]).claimGovernance()
                    ).to.be.revertedWith("No governance change active")
                })
            }
        )

        context(
            "When governance transfer is not in progress and called by a non-provisional governor",
            async () => {
                it("Reverts", async () => {
                    /* attempt to claim governance */
                    await expect(
                        pool.connect(signers[2]).claimGovernance()
                    ).to.be.revertedWith("No governance change active")
                })
            }
        )

        context(
            "When governance transfer is in progress and called by a non-provisional governor",
            async () => {
                it("Reverts", async () => {
                    /* start governance transfer */
                    await pool.transferGovernance(signers[1].address)

                    /* attempt to claim governance */
                    await expect(
                        pool.connect(signers[2]).claimGovernance()
                    ).to.be.revertedWith("Not provisional governor")
                })
            }
        )
    })
})
