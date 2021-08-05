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
import { MARKET, OPERATOR_ROLE, MARKET_2, ADMIN_ROLE } from "../constants"
import { isValidMnemonic } from "ethers/lib/utils"

chai.use(chaiAsPromised)
const { expect } = chai

describe("OracleWrapper - setOracle", () => {
    let oracleWrapper: TestOracleWrapper
    let signers: SignerWithAddress[]
    let testOracle: TestChainlinkOracle
    let testOracle2: TestChainlinkOracle
    beforeEach(async () => {
        // Deploy the contract
        signers = await ethers.getSigners()
        const chainlinkOracleFactory = (await ethers.getContractFactory(
            "TestChainlinkOracle",
            signers[0]
        )) as TestChainlinkOracle__factory
        const chainlinkOracle = await chainlinkOracleFactory.deploy()
        testOracle = await chainlinkOracleFactory.deploy()
        testOracle2 = await chainlinkOracleFactory.deploy()
        await testOracle.deployed()
        await testOracle2.deployed()

        // Deploy tokens
        const oracleWrapperFactory = (await ethers.getContractFactory(
            "TestOracleWrapper",
            signers[0]
        )) as TestOracleWrapper__factory
        oracleWrapper = await oracleWrapperFactory.deploy(
            chainlinkOracle.address
        )
        await oracleWrapper.deployed()

        // Sanity check the deployment
        expect(await oracleWrapper.owner()).to.equal(signers[0].address)
    })
    it("should allow an authorized operator to set an oracle", async () => {
        await oracleWrapper.transferOwnership(signers[1].address)
        await oracleWrapper.connect(signers[1]).setOracle(testOracle.address)

        expect(await oracleWrapper.oracle()).to.eq(testOracle.address)
    })
    it("should prevent unauthorized operators from setting an oracle", async () => {
        await expect(
            oracleWrapper.connect(signers[2]).setOracle(testOracle.address)
        ).to.be.rejectedWith(Error)
    })
    it("should prevent setting an oracle to the null address", async () => {
        await expect(
            oracleWrapper.setOracle(ethers.constants.AddressZero)
        ).to.be.rejectedWith(Error)
    })
})
