import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { PoolSwapLibrary, PoolSwapLibrary__factory } from "../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

describe("PoolSwapLibrary - getBalancesAfterFees", () => {
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

    it("should return the amount proportional to the short and long balances", async () => {
        const keeperReward = ethers.utils.parseEther("10")
        const shortBalance = ethers.utils.parseEther("100")
        const longBalance = ethers.utils.parseEther("100")

        const afterRewardBalances = await library.getBalancesAfterFees(
            keeperReward,
            shortBalance,
            longBalance
        )

        expect(afterRewardBalances[0]).to.eq(
            ethers.utils.parseEther("95").toString()
        )
        expect(afterRewardBalances[1]).to.eq(
            ethers.utils.parseEther("95").toString()
        )
    })
    it("should return 0 if keeper rewards are greater than the total balances", async () => {
        const keeperReward = ethers.utils.parseEther("210")
        const shortBalance = ethers.utils.parseEther("100")
        const longBalance = ethers.utils.parseEther("100")

        const afterRewardBalances = await library.getBalancesAfterFees(
            keeperReward,
            shortBalance,
            longBalance
        )

        expect(afterRewardBalances[0]).to.eq(
            ethers.utils.parseEther(shortBalance.toString())
        )
        expect(afterRewardBalances[1]).to.eq(
            ethers.utils.parseEther(longBalance.toString())
        )
    })
})
