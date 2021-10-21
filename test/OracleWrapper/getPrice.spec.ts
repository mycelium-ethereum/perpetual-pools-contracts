import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    ChainlinkOracleWrapper__factory,
    ChainlinkOracleWrapper,
    TestChainlinkOracle__factory,
    TestChainlinkOracle,
} from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

describe("OracleWrapper - getPrice", () => {
    let oracleWrapper: ChainlinkOracleWrapper
    let testOracle: TestChainlinkOracle
    let testOracle2: TestChainlinkOracle
    let signers: SignerWithAddress[]
    beforeEach(async () => {
        // Deploy the contract
        signers = await ethers.getSigners()
        const chainlinkOracleFactory = (await ethers.getContractFactory(
            "TestChainlinkOracle",
            signers[0]
        )) as TestChainlinkOracle__factory
        const chainlinkOracle = await chainlinkOracleFactory.deploy()

        // Deploy tokens
        const oracleWrapperFactory = (await ethers.getContractFactory(
            "ChainlinkOracleWrapper",
            signers[0]
        )) as ChainlinkOracleWrapper__factory
        oracleWrapper = await oracleWrapperFactory.deploy(
            chainlinkOracle.address
        )
        await oracleWrapper.deployed()

        // Deploy the sample oracle
        const oracleFactory = (await ethers.getContractFactory(
            "TestChainlinkOracle",
            signers[0]
        )) as TestChainlinkOracle__factory
        testOracle = await oracleFactory.deploy()
        testOracle2 = await oracleFactory.deploy()
    })
    it("should return the current price for the requested market", async () => {
        expect((await oracleWrapper.getPrice()).gte(0)).to.eq(true)
    })
})
