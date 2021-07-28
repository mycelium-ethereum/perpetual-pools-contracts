import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    OracleWrapper__factory,
    OracleWrapper,
    TestOracle__factory,
    TestOracle,
} from "../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { MARKET, OPERATOR_ROLE, ADMIN_ROLE, MARKET_2 } from "../constants"

chai.use(chaiAsPromised)
const { expect } = chai

describe("OracleWrapper - getPrice", () => {
    let oracleWrapper: OracleWrapper
    let testOracle: TestOracle
    let testOracle2: TestOracle
    let signers: SignerWithAddress[]
    beforeEach(async () => {
        // Deploy the contract
        signers = await ethers.getSigners()
        const factory = (await ethers.getContractFactory(
            "OracleWrapper",
            signers[0]
        )) as OracleWrapper__factory

        // Deploy the sample oracle
        const oracleFactory = (await ethers.getContractFactory(
            "TestOracle",
            signers[0]
        )) as TestOracle__factory

        testOracle = await oracleFactory.deploy()
        testOracle2 = await oracleFactory.deploy()
        oracleWrapper = await factory.deploy()
        await oracleWrapper.deployed()
        await testOracle.deployed()
        await testOracle2.deployed()

        // Setup for tests
        await oracleWrapper.grantRole(
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
            signers[0].address
        )

        await oracleWrapper.setOracle(MARKET, testOracle.address)
        await oracleWrapper.setOracle(MARKET_2, testOracle2.address)

        // change price on oracle 2 to $1.50
        await testOracle2.setPrice("150000000")

        // Sanity check the deployment
        expect(
            await oracleWrapper.hasRole(
                ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
                signers[0].address
            )
        ).to.eq(true)
        expect(
            await oracleWrapper.hasRole(
                ethers.utils.keccak256(ethers.utils.toUtf8Bytes(ADMIN_ROLE)),
                signers[0].address
            )
        ).to.eq(true)
        expect(await oracleWrapper.assetOracles(MARKET)).to.eq(
            testOracle.address
        )
        expect(await oracleWrapper.assetOracles(MARKET_2)).to.eq(
            testOracle2.address
        )
    })
    it("should return the current price for the requested market", async () => {
        expect((await oracleWrapper.getPrice(MARKET)).gte(0)).to.eq(true)
    })

    it("should return a different price for a different market", async () => {
        const price1 = await oracleWrapper.getPrice(MARKET)
        const price2 = await oracleWrapper.getPrice(MARKET_2)
        expect(!price1.eq(price2)).to.eq(true)
    })
})
