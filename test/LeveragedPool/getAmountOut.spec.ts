import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { LeveragedPool, LeveragedPool__factory } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { POOL_CODE } from "../constants";
import { generateRandomAddress } from "../utilities";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("LeveragedPool - getAmountOut", () => {
  let pool: LeveragedPool;
  let signers: SignerWithAddress[];
  beforeEach(async () => {
    // Deploy the contracts
    signers = await ethers.getSigners();

    const poolFactory = (await ethers.getContractFactory(
      "LeveragedPool",
      signers[0]
    )) as LeveragedPool__factory;
    pool = await poolFactory.deploy();
    await pool.deployed();
    await pool.initialize(
      POOL_CODE,
      5,
      5,
      1,
      5,
      5,
      generateRandomAddress(),
      generateRandomAddress()
    );
  });

  it("should return amountIn if the ratio is zero", async () => {});
  it("should revert if the amountIn is zero", async () => {});
  it("should ", async () => {});
});
