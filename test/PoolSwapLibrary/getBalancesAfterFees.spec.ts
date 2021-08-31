import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { PoolSwapLibrary, PoolSwapLibrary__factory } from "../../types"
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
        const keeperReward = ethers.utils.parseEther("0.10")

        const shortBalance = ethers.utils.parseEther("0.90")
        const longBalance = ethers.utils.parseEther("1.10")

        const afterRewardBalances = await library.getBalancesAfterFees(
            keeperReward,
            shortBalance,
            longBalance
        )

        expect(afterRewardBalances[0]).to.eq(
            ethers.utils.parseEther("0.855000000000000001").toString()
        )
        expect(afterRewardBalances[1]).to.eq(
            ethers.utils.parseEther("1.044999999999999999").toString()
        )
        expect(
            afterRewardBalances[0].add(afterRewardBalances[1]).add(keeperReward)
        ).to.equal(shortBalance.add(longBalance))
    })
    it("should return the amount proportional to the short and long balances", async () => {
        const keeperReward = ethers.utils.parseEther("0.10")

        const shortBalance = ethers.utils.parseEther("0.130298903128347192")
        const longBalance = ethers.utils.parseEther("1.129741927492121129")

        const afterRewardBalances = await library.getBalancesAfterFees(
            keeperReward,
            shortBalance,
            longBalance
        )

        expect(
            afterRewardBalances[0].add(afterRewardBalances[1]).add(keeperReward)
        ).to.equal(shortBalance.add(longBalance))
    })
})
