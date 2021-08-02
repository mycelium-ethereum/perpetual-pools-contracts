import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ChainlinkOracleWrapper__factory, ChainlinkOracleWrapper, ChainlinkOracle__factory } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  MARKET,
  ORACLE,
  OPERATOR_ROLE,
  MARKET_2,
  ORACLE_2,
  ADMIN_ROLE,
} from "../constants";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("OracleWrapper - setOracle", () => {
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

    // Sanity check the deployment
    expect(
      await oracleWrapper.hasRole(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(ADMIN_ROLE)),
        signers[0].address
      )
    ).to.eq(true);
  });
  it("should allow an authorized operator to set an oracle", async () => {
    await oracleWrapper.grantRole(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
      signers[1].address
    );
    await oracleWrapper.connect(signers[1]).setOracle(ORACLE);

    expect(
      await oracleWrapper.hasRole(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
        signers[1].address
      )
    ).to.eq(true);
    expect(await oracleWrapper.oracle()).to.eq(ORACLE);
  });
  it("should prevent unauthorized operators from setting an oracle", async () => {
    await expect(
      oracleWrapper.connect(signers[2]).setOracle(ORACLE)
    ).to.be.rejectedWith(Error);
  });
  it("should allow multiple operators to set oracles", async () => {
    await oracleWrapper.grantRole(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
      signers[1].address
    );
    await oracleWrapper.grantRole(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
      signers[2].address
    );
    await oracleWrapper.connect(signers[1]).setOracle(ORACLE);
    expect(await oracleWrapper.oracle()).to.eq(ORACLE);
    await oracleWrapper.connect(signers[2]).setOracle(ORACLE_2);
    expect(await oracleWrapper.oracle()).to.eq(ORACLE_2);
  });
  it("should prevent setting an oracle to the null address", async () => {
    await oracleWrapper.grantRole(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
      signers[1].address
    );

    await expect(
      oracleWrapper
        .connect(signers[1])
        .setOracle(ethers.constants.AddressZero)
    ).to.be.rejectedWith(Error);
  });
});
