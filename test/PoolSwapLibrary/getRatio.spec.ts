import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    TestPoolSwapLibrary,
    TestPoolSwapLibrary__factory,
} from "../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

describe("PoolSwapLibrary - getRatio", () => {
    let signers: SignerWithAddress[]
    let libraryMock: TestPoolSwapLibrary
    beforeEach(async () => {
        // Deploy the contracts
        signers = await ethers.getSigners()

        const libraryFactory = (await ethers.getContractFactory(
            "TestPoolSwapLibrary",
            signers[0]
        )) as TestPoolSwapLibrary__factory

        libraryMock = await libraryFactory.deploy()
        await libraryMock.deployed()
    })
    it("should return 0 if the denominator is 0", async () => {
        expect(
            ethers.BigNumber.from(
                await libraryMock.getRatio(1, 0)
            ).toHexString()
        ).to.eq("0x00")
    })
    it("should return 0 if the numerator is 0", async () => {
        expect(
            ethers.BigNumber.from(
                await libraryMock.getRatio(0, 1)
            ).toHexString()
        ).to.eq("0x00")
    })
    it("should return the correct fractional ratio", async () => {
        expect(
            ethers.BigNumber.from(
                await libraryMock.getRatio(
                    ethers.utils.parseEther("10"),
                    ethers.utils.parseEther("7")
                )
            ).toString()
        ).to.eq("85067624703458310250055920145753927094")
    })
    it("should return the correct whole ratio", async () => {
        expect(
            ethers.BigNumber.from(
                await libraryMock.getRatio(
                    ethers.utils.parseEther("10"),
                    ethers.utils.parseEther("2")
                )
            ).toString()
        ).to.eq("85077082101307784400379314978353577984")
    })
})
