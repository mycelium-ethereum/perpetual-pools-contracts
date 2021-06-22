import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ContractFactory, ContractFactory__factory } from "../../typechain";
import { MARKET, POOL_CODE } from "../../constants";

chai.use(chaiAsPromised);
const { expect } = chai;
describe("ContractFactory - deployPool", () => {
  before(async () => {});
  it("should deploy a minimal clone", async () => {});
  it("should initialize the clone", async () => {});
  it("should return the address of the clone", async () => {});
});
