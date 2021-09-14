import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { PoolSwapLibrary, PoolSwapLibrary__factory } from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

describe("PoolSwapLibrary - getWithdrawAmountOnBurn", () => {
    let signers: SignerWithAddress[]
    let library: PoolSwapLibrary
    beforeEach(async () => {
        // Deploy the contracts
        signers = await ethers.getSigners()

        const libraryFactory = (await ethers.getContractFactory(
            "PoolSwapLibrary",
            signers[0]
        )) as PoolSwapLibrary__factory

        library = await libraryFactory.deploy()
        await library.deployed()
    })

    context("Normal case", async () => {
        it("should return the amount proportional to the balances", async () => {
            const tokenSupply = ethers.utils.parseEther("1000")
            const amountIn = ethers.utils.parseEther("300")
            const balance = ethers.utils.parseEther("5000")
            const shadowBalance = ethers.utils.parseEther("5")

            const withdrawAmount = await library.getWithdrawAmountOnBurn(
                tokenSupply,
                amountIn,
                balance,
                shadowBalance
            )

            const expectedAmount = balance
                .mul(amountIn)
                .div(tokenSupply.add(shadowBalance))
            expect(withdrawAmount).to.equal(expectedAmount)
        })
    })
    context("tokenSupply + shadowBalance == 0", async () => {
        it("Return amountIn", async () => {
            const tokenSupply = ethers.utils.parseEther("0")
            const amountIn = ethers.utils.parseEther("1230")
            const balance = ethers.utils.parseEther("4560")
            const shadowBalance = ethers.utils.parseEther("0")

            const withdrawAmount = await library.getWithdrawAmountOnBurn(
                tokenSupply,
                amountIn,
                balance,
                shadowBalance
            )

            const expectedAmount = amountIn
            expect(withdrawAmount).to.equal(expectedAmount)
        })
    })
    context("balance == 0", async () => {
        it("Return amountIn", async () => {
            const tokenSupply = ethers.utils.parseEther("1000")
            const amountIn = ethers.utils.parseEther("120930")
            const balance = ethers.utils.parseEther("0")
            const shadowBalance = ethers.utils.parseEther("5")

            const withdrawAmount = await library.getWithdrawAmountOnBurn(
                tokenSupply,
                amountIn,
                balance,
                shadowBalance
            )

            const expectedAmount = amountIn
            expect(withdrawAmount).to.equal(expectedAmount)
        })
    })
    context("amountIn == 0", async () => {
        it("should revert", async () => {
            const tokenSupply = ethers.utils.parseEther("1000")
            const amountIn = ethers.utils.parseEther("0")
            const balance = ethers.utils.parseEther("5000")
            const shadowBalance = ethers.utils.parseEther("5")

            // Doesn't give correct error message, because when you call library directly,
            // and it reverts, it seems to always giv "library was called directly" error message
            await expect(
                library.getWithdrawAmountOnBurn(
                    tokenSupply,
                    amountIn,
                    balance,
                    shadowBalance
                )
            ).to.be.reverted
        })
    })
})
