import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    TestOracleWrapper__factory,
    TestOracleWrapper,
    TestChainlinkOracle__factory,
    TestChainlinkOracle,
} from "../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { MARKET, OPERATOR_ROLE, ADMIN_ROLE, MARKET_2 } from "../constants"

chai.use(chaiAsPromised)
const { expect } = chai

describe("OracleWrapper - getPrice", () => {
    let oracleWrapper: TestOracleWrapper
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
        const chainlinkOracleWrapperFactory = (await ethers.getContractFactory(
            "TestOracleWrapper",
            signers[0]
        )) as TestOracleWrapper__factory
        oracleWrapper = await chainlinkOracleWrapperFactory.deploy(
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

        await oracleWrapper.grantRole(
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
            signers[0].address
        )

        await oracleWrapper.setOracle(testOracle.address)

        // Sanity check the deployment
        expect(
            await oracleWrapper.hasRole(
                ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
                signers[0].address
            )
        ).to.eq(true)
        expect(await oracleWrapper.isAdmin(signers[0].address)).to.eq(true)
        expect(await oracleWrapper.oracle()).to.eq(testOracle.address)
    })
    it("should return the current price for the requested market", async () => {
        expect((await oracleWrapper.getPrice()).gte(0)).to.eq(true)
    })
})
