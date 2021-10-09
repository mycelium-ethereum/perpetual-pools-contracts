import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { PoolSwapLibrary, PoolSwapLibrary__factory } from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

describe("PoolSwapLibrary - getPrice", () => {
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

    describe("When sideBalance is 0", () => {
        it("returns 0", async () => {
            const sideBalance = ethers.utils.parseEther("0")
            const tokenSupply = ethers.utils.parseEther("101230")

            const price = await library.getPrice(sideBalance, tokenSupply)

            const zero = "0x00000000000000000000000000000000".toLowerCase() // 0 in IEE754 binary128
            expect(price.toLowerCase()).to.equal(zero)
        })
    })

    describe("When totalSupply is 0", () => {
        it("returns 1", async () => {
            const sideBalance = ethers.utils.parseEther("10000")
            const tokenSupply = ethers.utils.parseEther("0")

            const price = await library.getPrice(sideBalance, tokenSupply)

            const one = "0x3fff0000000000000000000000000000".toLowerCase() // 1 in IEE754 binary128
            expect(price.toLowerCase()).to.equal(one)
        })
    })

    describe("When price is == 1", () => {
        it("returns correctly", async () => {
            const sideBalance = ethers.utils.parseEther("10000")
            const tokenSupply = ethers.utils.parseEther("10000")

            const price = await library.getPrice(sideBalance, tokenSupply)

            const one = "0x3fff0000000000000000000000000000".toLowerCase() // 1 in IEE754 binary128
            expect(price.toLowerCase()).to.equal(one)
        })
    })

    describe("When price is > 1", () => {
        it("returns correctly", async () => {
            const sideBalance = ethers.utils.parseEther("10000")
            const tokenSupply = ethers.utils.parseEther("4000")

            const price = await library.getPrice(sideBalance, tokenSupply)

            const twoPointFive =
                "0x40004000000000000000000000000000".toLowerCase() // 2.5 in IEE754 binary128
            expect(price.toLowerCase()).to.equal(twoPointFive)
        })
    })

    describe("When price is 0.5", () => {
        it("returns correctly", async () => {
            const sideBalance = ethers.utils.parseEther("10000")
            const tokenSupply = ethers.utils.parseEther("20000")

            const price = await library.getPrice(sideBalance, tokenSupply)

            const halfInABDK =
                "0x3FFE0000000000000000000000000000".toLowerCase() // 0.5 in IEE754 binary128
            expect(price.toLowerCase()).to.equal(halfInABDK)
        })
    })
})
