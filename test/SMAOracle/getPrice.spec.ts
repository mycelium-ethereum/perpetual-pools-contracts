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
    PoolKeeper__factory,
    PoolKeeper,
} from "../../types"
import { POOL_CODE } from "../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
} from "../utilities"

describe("SMAOracle - getPrice", () => {
    let owner: SignerWithAddress
    let user1: SignerWithAddress
    let user2: SignerWithAddress
    let smaOracle: SMAOracle
    let chainlinkOracle: TestChainlinkOracle
    let poolKeeper: PoolKeeper
    const numPeriods: BigNumberish = 10
    const updateInterval: BigNumberish = 60
    const frontRunningInterval: BigNumberish = 10
    const leverage: BigNumberish = 1
    const fee: BigNumberish = 1
    const feeAddress = generateRandomAddress()

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

        /* deploy main contracts */
        const contracts = await deployPoolAndTokenContracts(
            POOL_CODE,
            frontRunningInterval,
            updateInterval,
            leverage,
            feeAddress,
            fee
        )
        poolKeeper = contracts.poolKeeper

        const SMAOracleFactory = (await ethers.getContractFactory(
            "SMAOracle"
        )) as SMAOracle__factory
        smaOracle = await SMAOracleFactory.deploy(
            chainlinkOracleWrapper.address,
            numPeriods,
            updateInterval,
            owner.address,
            owner.address
        )
        await smaOracle.deployed()
    })

    it("should return zero before the first poll", async () => {
        const price = await smaOracle.getPrice()
        expect(price).to.eq(0)
    })

    it("should return the spot price after the first poll", async () => {
        const unitPrice: BigNumberish = 2
        const chainlinkDecimals = await chainlinkOracle.decimals()
        const price = ethers.utils.parseUnits(
            unitPrice.toString(),
            chainlinkDecimals
        )
        await chainlinkOracle.setPrice(price)
        await smaOracle.poll()
        const result = await smaOracle.getPrice()
        expect(result).to.equal(
            ethers.utils.parseUnits(unitPrice.toString(), 18)
        )
    })

    it("should return the correct price with 2 entries", async () => {
        const unitPrices: BigNumberish[] = [2, 3]
        const chainlinkDecimals = await chainlinkOracle.decimals()
        for (const unitPrice of unitPrices) {
            const price = ethers.utils.parseUnits(
                unitPrice.toString(),
                chainlinkDecimals
            )
            await chainlinkOracle.setPrice(price)
            await ethers.provider.send("evm_increaseTime", [updateInterval])
            await smaOracle.poll()
        }
        const result = await smaOracle.getPrice()
        const expectedUnitPrice = 2.5
        const expectedPrice = ethers.utils.parseUnits(
            expectedUnitPrice.toString(),
            18
        )
        expect(result).to.equal(expectedPrice)
    })

    it("should return the correct price once fully ramped up", async () => {
        const unitPrices: BigNumberish[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] // 10 periods
        const chainlinkDecimals = await chainlinkOracle.decimals()
        for (const unitPrice of unitPrices) {
            const price = ethers.utils.parseUnits(
                unitPrice.toString(),
                chainlinkDecimals
            )
            await chainlinkOracle.setPrice(price)
            await ethers.provider.send("evm_increaseTime", [updateInterval])
            await smaOracle.poll()
        }
        const result = await smaOracle.getPrice()
        const expectedUnitPrice = 5.5
        const expectedPrice = ethers.utils.parseUnits(
            expectedUnitPrice.toString(),
            18
        )
        expect(result).to.equal(expectedPrice)
    })

    it("should return the correct price after a price is rolled off", async () => {
        const unitPrices: BigNumberish[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] // More than 10 periods

        const chainlinkDecimals = await chainlinkOracle.decimals()
        for (const unitPrice of unitPrices) {
            const price = ethers.utils.parseUnits(
                unitPrice.toString(),
                chainlinkDecimals
            )
            await chainlinkOracle.setPrice(price)
            await ethers.provider.send("evm_increaseTime", [updateInterval])

            await smaOracle.poll()
        }
        const result = await smaOracle.getPrice()
        const expectedUnitPrice = 6.5
        const expectedPrice = ethers.utils.parseUnits(
            expectedUnitPrice.toString(),
            18
        )
        expect(result).to.equal(expectedPrice)
    })

    it("should return the correct price after it has doubled the numPeriods", async () => {
        const unitPrices: BigNumberish[] = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            20, 21, 22, 23, 24,
        ]

        const chainlinkDecimals = await chainlinkOracle.decimals()
        for (const unitPrice of unitPrices) {
            const price = ethers.utils.parseUnits(
                unitPrice.toString(),
                chainlinkDecimals
            )
            await chainlinkOracle.setPrice(price)
            await ethers.provider.send("evm_increaseTime", [updateInterval])
            await smaOracle.poll()
        }
        const result = await smaOracle.getPrice()
        const expectedUnitPrice = 19.5
        const expectedPrice = ethers.utils.parseUnits(
            expectedUnitPrice.toString(),
            18
        )
        expect(result).to.equal(expectedPrice)
    })

    it("should return the correct price with 25 prices", async () => {
        const unitPrices: BigNumberish[] = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            20, 21, 22, 23, 24, 25,
        ]

        const chainlinkDecimals = await chainlinkOracle.decimals()
        for (const unitPrice of unitPrices) {
            const price = ethers.utils.parseUnits(
                unitPrice.toString(),
                chainlinkDecimals
            )
            await chainlinkOracle.setPrice(price)
            await ethers.provider.send("evm_increaseTime", [updateInterval])
            await smaOracle.poll()
        }
        const result = await smaOracle.getPrice()
        const expectedUnitPrice = 20.5
        const expectedPrice = ethers.utils.parseUnits(
            expectedUnitPrice.toString(),
            18
        )
        expect(result).to.equal(expectedPrice)
    })
})
