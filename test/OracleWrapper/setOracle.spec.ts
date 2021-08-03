import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    TestChainlinkOracleWrapper__factory,
    TestChainlinkOracleWrapper,
    TestChainlinkOracle__factory,
    TestChainlinkOracle,
} from "../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { MARKET, OPERATOR_ROLE, MARKET_2, ADMIN_ROLE } from "../constants"
import { isValidMnemonic } from "ethers/lib/utils"

chai.use(chaiAsPromised)
const { expect } = chai

describe("OracleWrapper - setOracle", () => {
    let oracleWrapper: TestChainlinkOracleWrapper
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
        const chainlinkOracleWrapperFactory = (await ethers.getContractFactory(
            "TestChainlinkOracleWrapper",
            signers[0]
        )) as TestChainlinkOracleWrapper__factory
        oracleWrapper = await chainlinkOracleWrapperFactory.deploy(
            chainlinkOracle.address
        )
        await oracleWrapper.deployed()

        // Sanity check the deployment
        expect(await oracleWrapper.isAdmin(signers[0].address)).to.equal(true)
    })
    it("should allow an authorized operator to set an oracle", async () => {
        await oracleWrapper.switchAdmin(signers[1].address)
        await oracleWrapper.connect(signers[1]).setOracle(testOracle.address)

        expect(await oracleWrapper.isAdmin(signers[1].address)).to.equal(true)
        expect(await oracleWrapper.isAdmin(signers[0].address)).to.equal(false)
        expect(await oracleWrapper.oracle()).to.eq(testOracle.address)
    })
    it("should prevent unauthorized operators from setting an oracle", async () => {
        await expect(
            oracleWrapper.connect(signers[2]).setOracle(testOracle.address)
        ).to.be.rejectedWith(Error)
    })
    // Currently skipped because we are moving to an Ownable model (not AccessControl)
    it.skip("should allow multiple operators to set oracles", async () => {
        await oracleWrapper.grantRole(
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
            signers[1].address
        )
        await oracleWrapper.grantRole(
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
            signers[2].address
        )
        await oracleWrapper.connect(signers[1]).setOracle(testOracle.address)
        expect(await oracleWrapper.oracle()).to.eq(testOracle.address)
        await oracleWrapper.connect(signers[2]).setOracle(testOracle2.address)
        expect(await oracleWrapper.oracle()).to.eq(testOracle2.address)
    })
    it("should prevent setting an oracle to the null address", async () => {
        await oracleWrapper.grantRole(
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
            signers[1].address
        )

        await expect(
            oracleWrapper
                .connect(signers[1])
                .setOracle(ethers.constants.AddressZero)
        ).to.be.rejectedWith(Error)
    })
})
