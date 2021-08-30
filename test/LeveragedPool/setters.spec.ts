import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { ethers } from "hardhat"
import { LeveragedPool, PoolKeeper } from "../../typechain"
import { POOL_CODE } from "../constants"
import { deployPoolAndTokenContracts } from "../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

describe("LeveragedPool - setters", () => {
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
            "0x00000000000000000000000000000000"
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
            ).to.be.revertedWith("msg.sender not governance")
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
            ).to.be.revertedWith("msg.sender not governance")
        })
    })

    context("transferGovernance", async () => {
        it("should set the governance address", async () => {
            await pool.transferGovernance(signers[1].address)
            expect(await pool.governance()).to.eq(signers[1].address)
        })
        it("should prevent unauthorized access", async () => {
            await pool.transferGovernance(signers[1].address)
            await expect(
                pool.connect(signers[2]).transferGovernance(signers[2].address)
            ).to.be.rejectedWith("msg.sender not governance")
        })
    })
})
