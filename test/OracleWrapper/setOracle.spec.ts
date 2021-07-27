import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { OracleWrapper__factory, OracleWrapper, TestOracle__factory, TestOracle } from "../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    MARKET,
    OPERATOR_ROLE,
    MARKET_2,
    ADMIN_ROLE,
} from "../constants"

chai.use(chaiAsPromised)
const { expect } = chai

describe("OracleWrapper - setOracle", () => {
    let oracleWrapper: OracleWrapper
    let signers: SignerWithAddress[]
    let testOracle: TestOracle
    let testOracle2: TestOracle
    beforeEach(async () => {
        // Deploy the contract
        signers = await ethers.getSigners()
        const factory = (await ethers.getContractFactory(
            "OracleWrapper",
            signers[0]
        )) as OracleWrapper__factory
        oracleWrapper = await factory.deploy()
        await oracleWrapper.deployed()

        // Deploy the sample oracle
        const oracleFactory = (await ethers.getContractFactory(
            "TestOracle",
            signers[0]
        )) as TestOracle__factory

        testOracle = await oracleFactory.deploy()
        testOracle2 = await oracleFactory.deploy()
        await testOracle.deployed()
        await testOracle2.deployed()

        // Sanity check the deployment
        expect(
            await oracleWrapper.hasRole(
                ethers.utils.keccak256(ethers.utils.toUtf8Bytes(ADMIN_ROLE)),
                signers[0].address
            )
        ).to.eq(true)
    })
    it("should allow an authorized operator to set an oracle", async () => {
        await oracleWrapper.grantRole(
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
            signers[1].address
        )
        await oracleWrapper.connect(signers[1]).setOracle(MARKET, testOracle.address)

        expect(
            await oracleWrapper.hasRole(
                ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
                signers[1].address
            )
        ).to.eq(true)
        expect(await oracleWrapper.assetOracles(MARKET)).to.eq(testOracle.address)
    })
    it("should prevent unauthorized operators from setting an oracle", async () => {
        await expect(
            oracleWrapper.connect(signers[2]).setOracle(MARKET, testOracle.address)
        ).to.be.rejectedWith(Error)
    })
    it("should allow multiple operators to set oracles", async () => {
        await oracleWrapper.grantRole(
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
            signers[1].address
        )
        await oracleWrapper.grantRole(
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
            signers[2].address
        )
        await oracleWrapper.connect(signers[1]).setOracle(MARKET, testOracle.address)
        await oracleWrapper.connect(signers[2]).setOracle(MARKET_2, testOracle2.address)

        expect(await oracleWrapper.assetOracles(MARKET)).to.eq(testOracle.address)
        expect(await oracleWrapper.assetOracles(MARKET_2)).to.eq(testOracle2.address)
    })
    it("should prevent setting an oracle to the null address", async () => {
        await oracleWrapper.grantRole(
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
            signers[1].address
        )

        await expect(
            oracleWrapper
                .connect(signers[1])
                .setOracle(MARKET, ethers.constants.AddressZero)
        ).to.be.rejectedWith(Error)
    })
})
