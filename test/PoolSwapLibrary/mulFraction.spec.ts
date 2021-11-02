import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { PoolSwapLibrary, PoolSwapLibrary__factory } from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

describe("PoolSwapLibrary - mulFraction", () => {
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
    it("should return 0 if the denominator is 0", async () => {
        expect(
            ethers.BigNumber.from(
                await library.mulFraction(1, 1, 0)
            ).toHexString()
        ).to.eq("0x00")
    })
    it("should return 0 if the numerator is 0", async () => {
        expect(
            ethers.BigNumber.from(
                await library.mulFraction(1, 0, 1)
            ).toHexString()
        ).to.eq("0x00")
    })
    it("should return the correct result", async () => {
        expect(
            ethers.BigNumber.from(
                await library.mulFraction(
                    ethers.utils.parseEther("10"),
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("10")
                )
            ).toString()
        ).to.eq(ethers.utils.parseEther("1"))
    })
    it("should return same number if fraction is 1", async () => {
        expect(
            ethers.BigNumber.from(
                await library.mulFraction(
                    ethers.utils.parseEther("10"),
                    ethers.utils.parseEther("1"),
                    ethers.utils.parseEther("1")
                )
            ).toString()
        ).to.eq(ethers.utils.parseEther("10"))
    })
})
