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
    ).to.eq(ethers.utils.parseEther("10").toString());

    expect(
      (
        await pool.getAmountOut(
          ethers.utils.parseEther("2"),
          ethers.utils.parseEther("10")
        )
      ).toString()
    ).to.eq(
      ethers.utils.parseEther("2").mul(ethers.utils.parseEther("10")).toString()
    );
  });
  it("should return the correct amount sans precision for values >2^256", async () => {
    console.log(
      (
        await pool.getAmountOut(
          ethers.BigNumber.from(10).pow(38).mul(20),
          ethers.utils.parseEther("10")
        )
      ).toString()
    );
    expect(
      (
        await pool.getAmountOut(
          ethers.BigNumber.from(10).pow(38).mul(20),
          ethers.utils.parseEther("10")
        )
      ).toString()
    ).to.eq(
      ethers.BigNumber.from(10)
        .pow(38)
        .mul(20)
        .mul(ethers.utils.parseEther("10"))
        .div(ethers.BigNumber.from(10).pow(38))
    );
  });
});
