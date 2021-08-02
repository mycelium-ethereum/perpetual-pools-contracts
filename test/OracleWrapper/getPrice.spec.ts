import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ChainlinkOracleWrapper__factory, ChainlinkOracleWrapper, ChainlinkOracle__factory } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  MARKET,
  ORACLE,
  OPERATOR_ROLE,
  ADMIN_ROLE,
  ORACLE_2,
  MARKET_2,
} from "../constants";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("OracleWrapper - getPrice", () => {
  let oracleWrapper: ChainlinkOracleWrapper;
  let signers: SignerWithAddress[];
  beforeEach(async () => {
    // Deploy the contract
    signers = await ethers.getSigners();
      const chainlinkOracleFactory = (await ethers.getContractFactory(
        "ChainlinkOracle",
        signers[0]
      )) as ChainlinkOracle__factory;
      const chainlinkOracle = await chainlinkOracleFactory.deploy();

      // Deploy tokens
      const chainlinkOracleWrapperFactory = (await ethers.getContractFactory(
        "ChainlinkOracleWrapper",
        signers[0]
      )) as ChainlinkOracleWrapper__factory;
      const oracleWrapper = await chainlinkOracleWrapperFactory.deploy(chainlinkOracle.address);
    await oracleWrapper.deployed();

    // Setup for tests
    await oracleWrapper.grantRole(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
      signers[0].address
    );

    await oracleWrapper.setOracle(ORACLE);

    // Sanity check the deployment
    expect(
      await oracleWrapper.hasRole(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
        signers[0].address
      )
    ).to.eq(true);
    expect(
      await oracleWrapper.hasRole(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(ADMIN_ROLE)),
        signers[0].address
      )
    ).to.eq(true);
    expect(await oracleWrapper.oracle()).to.eq(ORACLE);
  });
  it("should return the current price for the requested market", async () => {
    expect((await oracleWrapper.getPrice()).gte(0)).to.eq(true);
  });
});
