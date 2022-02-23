import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { BigNumberish } from "ethers"
import { ethers } from "hardhat"
import {
    SMAOracle,
    TestChainlinkOracle,
    TestChainlinkOracle__factory,
    SMAOracle__factory,
    ChainlinkOracleWrapper__factory,
} from "../../types"

describe("SMAOracle - getPrice", () => {
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let smaOracle: SMAOracle
    let chainlinkOracle: TestChainlinkOracle
    const numPeriods: BigNumberish = 10
    const updateInterval: BigNumberish = 60

    beforeEach(async () => {
        ;[owner, user1, user2] = await ethers.getSigners()

        const TestChainlinkOracleFactory = (await ethers.getContractFactory(
            "TestChainlinkOracle"
        )) as TestChainlinkOracle__factory
        chainlinkOracle = await TestChainlinkOracleFactory.deploy()
        await chainlinkOracle.deployed()

        const ChainlinkOracleWrapperFactory = (await ethers.getContractFactory(
            "ChainlinkOracleWrapper"
        )) as ChainlinkOracleWrapper__factory
        const chainlinkOracleWrapper =
            await ChainlinkOracleWrapperFactory.deploy(
                chainlinkOracle.address,
                owner.address
            )
        await chainlinkOracleWrapper.deployed()

        const SMAOracleFactory = (await ethers.getContractFactory(
            "SMAOracle"
        )) as SMAOracle__factory
        smaOracle = await SMAOracleFactory.deploy(
            chainlinkOracleWrapper.address,
            18,
            numPeriods,
            updateInterval,
            owner.address
        )
        await smaOracle.deployed()
    })

    it("should add a price to the prices mapping", async () => {
        await chainlinkOracle.setPrice(ethers.utils.parseUnits("5", 8))

        expect(await smaOracle.periodCount()).to.equal(0)
        expect(await smaOracle.prices(0)).to.equal(0)

        await smaOracle.poll()

        expect(await smaOracle.periodCount()).to.equal(1)
        expect(await smaOracle.prices(0)).to.equal(
            ethers.utils.parseUnits("5", 18)
        )
    })

    it("should not add a second price to the observer if the updateInterval hasn't passed", async () => {
        await chainlinkOracle.setPrice(ethers.utils.parseUnits("5", 8))

        await smaOracle.poll()

        expect(await smaOracle.periodCount()).to.equal(1)
        expect(await smaOracle.prices(0)).to.equal(
            ethers.utils.parseUnits("5", 18)
        )

        await chainlinkOracle.setPrice(ethers.utils.parseUnits("6", 8))

        await smaOracle.poll()
        expect(await smaOracle.periodCount()).to.equal(1)
        expect(await smaOracle.prices(1)).to.equal(0)
    })

    it("should add a second price to the observer if the updateInterval has passed", async () => {
        await chainlinkOracle.setPrice(ethers.utils.parseUnits("5", 8))

        await smaOracle.poll()

        expect(await smaOracle.periodCount()).to.equal(1)
        expect(await smaOracle.prices(0)).to.equal(
            ethers.utils.parseUnits("5", 18)
        )

        await chainlinkOracle.setPrice(ethers.utils.parseUnits("10", 8))

        await ethers.provider.send("evm_increaseTime", [updateInterval])

        await smaOracle.poll()
        expect(await smaOracle.periodCount()).to.equal(2)
        expect(await smaOracle.prices(1)).to.equal(
            ethers.utils.parseUnits("10", 18)
        )
    })

    it("should update the lastUpdate to the block timestamp if the updateInterval has passed", async () => {
        const tx1 = await smaOracle.poll()

        const lastUpdate1 = await smaOracle.lastUpdate()
        const block1 = await ethers.provider.getBlock(tx1.blockHash!)
        expect(lastUpdate1).to.equal(block1.timestamp)

        await ethers.provider.send("evm_increaseTime", [updateInterval])
        const tx2 = await smaOracle.poll()

        const lastUpdate2 = await smaOracle.lastUpdate()
        const block2 = await ethers.provider.getBlock(tx2.blockHash!)
        expect(lastUpdate2).to.be.gte(block1.timestamp + updateInterval)
        expect(lastUpdate2).to.equal(block2.timestamp)
    })

    it("should not update the lastUpdate if the updateInterval has not passed", async () => {
        const tx1 = await smaOracle.poll()

        const lastUpdate1 = await smaOracle.lastUpdate()
        const block1 = await ethers.provider.getBlock(tx1.blockHash!)
        expect(lastUpdate1).to.equal(block1.timestamp)

        const tx2 = await smaOracle.poll()
        const block2 = await ethers.provider.getBlock(tx2.blockHash!)
        const lastUpdate2 = await smaOracle.lastUpdate()
        expect(lastUpdate2).to.equal(lastUpdate1)
        expect(lastUpdate2).to.not.equal(block2.timestamp)
    })

    it("should delete the oldest price when a new price is added after ramping up", async () => {
        expect(await smaOracle.periodCount()).to.equal(0)
        await chainlinkOracle.setPrice(ethers.utils.parseUnits("420", 8))
        // Fill all the necessary periods
        for (let i = 0; i < numPeriods; i++) {
            await smaOracle.poll()
            expect(await smaOracle.periodCount()).to.equal(i + 1)
            await ethers.provider.send("evm_increaseTime", [updateInterval])
        }
        expect(await smaOracle.prices(0)).to.equal(
            ethers.utils.parseUnits("420", 18)
        )
        await smaOracle.poll()
        expect(await smaOracle.prices(0)).to.equal(0)
        expect(await smaOracle.prices(1)).to.equal(
            ethers.utils.parseUnits("420", 18)
        )
        await ethers.provider.send("evm_increaseTime", [updateInterval])
        await smaOracle.poll()
        expect(await smaOracle.prices(1)).to.equal(0)
    })
})
