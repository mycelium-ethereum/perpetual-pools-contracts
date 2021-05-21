import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { OracleWrapper__factory, OracleWrapper } from "../../typechain";
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
  let oracleWrapper: OracleWrapper;
  let signers: SignerWithAddress[];
  beforeEach(async () => {
    // Deploy the contract
    signers = await ethers.getSigners();
    const factory = (await ethers.getContractFactory(
      "OracleWrapper",
      signers[0]
    )) as OracleWrapper__factory;
    oracleWrapper = await factory.deploy();
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
    await oracleWrapper.connect(signers[1]).setOracle(MARKET, ORACLE);

    expect(
      await oracleWrapper.hasRole(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
        signers[1].address
      )
    ).to.eq(true);
    expect(await oracleWrapper.assetOracles(MARKET)).to.eq(ORACLE);
  });
  it("should prevent unauthorized operators from setting an oracle", async () => {
    await expect(
      oracleWrapper.connect(signers[2]).setOracle(MARKET, ORACLE)
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
    await oracleWrapper.connect(signers[1]).setOracle(MARKET, ORACLE);
    await oracleWrapper.connect(signers[2]).setOracle(MARKET_2, ORACLE_2);

    expect(await oracleWrapper.assetOracles(MARKET)).to.eq(ORACLE);
    expect(await oracleWrapper.assetOracles(MARKET_2)).to.eq(ORACLE_2);
  });
});
