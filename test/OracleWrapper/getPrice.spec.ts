import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { OracleWrapper__factory, OracleWrapper } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MARKET, ORACLE, OPERATOR_ROLE, ADMIN_ROLE } from "../constants";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("OracleWrapper - getPrice", () => {
  let oracleWrapper: OracleWrapper;
  let signers: SignerWithAddress[];
  beforeEach(async () => {
    // Deploy the contract
    const signers = await ethers.getSigners();
    const factory = (await ethers.getContractFactory(
      "OracleWrapper",
      signers[0]
    )) as OracleWrapper__factory;
    const oracleWrapper = await factory.deploy();
    await oracleWrapper.deployed();

    await oracleWrapper.grantRole(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
      signers[0].address
    );
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
  });
  it("should return the current price for the requested market", async () => {
    await oracleWrapper.setOracle(MARKET, ORACLE);
    expect(await oracleWrapper.getPrice(MARKET)).to.be.greaterThan(0);
  });
  it("should return a different price for a different market", async () => {});
});
