import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { LeveragedPool, LeveragedPool__factory } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  MARKET,
  ORACLE,
  OPERATOR_ROLE,
  MARKET_2,
  ORACLE_2,
  ADMIN_ROLE,
  POOL_CODE,
} from "../constants";
import { generateRandomAddress } from "../utilities";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("LeveragedPool - getRatio", () => {
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

  it("should return zero if the denominator is zero", async () => {
    const result = await pool.getRatio(5, 0);
    expect(result.eq(0)).to.eq(true);
  });
  it("should return zero if the numerator is zero", async () => {
    const result = await pool.getRatio(0, 5);
    expect(result.eq(0)).to.eq(true);
  });
  it("should return the correct result for high numerator, low denominator", async () => {
    const result = await pool.getRatio(
      ethers.utils.parseEther("20"),
      ethers.utils.parseEther("2")
    );

    expect(result.toString()).to.eq(ethers.utils.parseEther("10").toString());
  });
  it("should return the correct result for low numerator, high denominator", async () => {
    const result = await pool.getRatio(
      ethers.utils.parseEther("2"),
      ethers.utils.parseEther("20")
    );

    expect(result.toString()).to.eq(ethers.utils.parseEther("0.1").toString());
  });
  it("should return the correct result for extreme high numerator, low denominator", async () => {
    const result = await pool.getRatio(
      ethers.utils.parseEther("2000000000000000000"), //2*10^18,
      ethers.utils.parseEther("2")
    );

    expect(result.toString()).to.eq("1000000000000000000000000000000000000");
  });
  it("should return the correct result for low numerator,  extreme high denominator", async () => {
    const result = await pool.getRatio(
      ethers.utils.parseEther("2"),
      ethers.utils.parseEther("2000000000000000000") //2*10^18
    );
    console.log(result.toString());

    expect(result.toString()).to.eq("1");
  });
});
