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

  it("should return amountIn if the ratio is zero", async () => {
    expect(await pool.getAmountOut(0, 5)).to.eq(5);
  });
  it("should revert if the amountIn is zero", async () => {
    await expect(pool.getAmountOut(5, 0)).to.rejectedWith(Error);
  });
  it("should return the correct amount for safe values", async () => {
    expect(
      (
        await pool.getAmountOut(
          ethers.utils.parseUnits("1", "wei"),
          ethers.utils.parseEther("10")
        )
      ).toString()
    ).to.eq(ethers.utils.parseUnits("10", "wei").toString());
    expect(
      (
        await pool.getAmountOut(
          ethers.utils.parseUnits("2", "ether"),
          ethers.utils.parseEther("10")
        )
      ).toString()
    ).to.eq(ethers.utils.parseUnits("20", "ether").toString());
  });
  it("should return the correct amount sans precision for values >2^256", async () => {
    throw new Error();
  });
});
