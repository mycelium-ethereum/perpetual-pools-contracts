import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { PoolSwapLibrary, PoolSwapLibrary__factory } from "../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

describe("PoolSwapLibrary - getRatio", () => {
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
            ethers.BigNumber.from(await library.getRatio(1, 0)).toHexString()
        ).to.eq("0x00")
    })
    it("should return 0 if the numerator is 0", async () => {
        expect(
            ethers.BigNumber.from(await library.getRatio(0, 1)).toHexString()
        ).to.eq("0x00")
    })
    it("should return the correct fractional ratio", async () => {
        expect(
            ethers.BigNumber.from(
                await library.getRatio(
                    ethers.utils.parseEther("10"),
                    ethers.utils.parseEther("7")
                )
            ).toString()
        ).to.eq("85067624703458310250055920145753927094")
    })
    it("should return the correct whole ratio", async () => {
        expect(
            ethers.BigNumber.from(
                await library.getRatio(
                    ethers.utils.parseEther("10"),
                    ethers.utils.parseEther("2")
                )
            ).toString()
        ).to.eq("85077082101307784400379314978353577984")
    })
})
