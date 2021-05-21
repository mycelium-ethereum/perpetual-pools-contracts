import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { OracleWrapper__factory, OracleWrapper } from "../../typechain";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("OracleWrapper - getPrice", () => {
  let oracleWrapper: OracleWrapper;
  beforeEach(async () => {
    // Deploy the oracleWrapper
    // const signers = await ethers.getSigners();
    // const factory = (await ethers.getContractFactory(
    //   "OracleWrapper",
    //   signers[0]
    // )) as OracleWrapper__factory;
    // oracleWrapper = await factory.deploy();
    // await oracleWrapper.deployed();
    // // Sanity check the deployments
    // expect(
    //   oracleWrapper.hasRole(
    //     ethers.utils.keccak256("OPERATOR"),
    //     signers[0].address
    //   )
    // );
  });
  it("should allow an authorized operator to set an oracle", async () => {});
  it("should prevent unauthorized operators from setting an oracle", async () => {});
  it("should allow multiple operators to set oracles", async () => {});
});
