import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { LeveragedPool__factory, LeveragedPool } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ADMIN_ROLE, POOL_CODE, UPDATER_ROLE } from "../constants";
import { generateRandomAddress } from "../utilities";

chai.use(chaiAsPromised);
const { expect } = chai;

const initialisePool = (pool: LeveragedPool, params?: any[]) => {
  return pool.initialize(
    POOL_CODE,
    50000,
    10,
    5,
    2,
    7,
    generateRandomAddress(),
    generateRandomAddress()
  );
};

describe("LeveragedPool - initialize", () => {
  let leveragedPool: LeveragedPool;
  let signers: SignerWithAddress[];
  beforeEach(async () => {
    // Deploy the contracts
    signers = await ethers.getSigners();

    const leveragedPoolFactory = (await ethers.getContractFactory(
      "LeveragedPool",
      signers[0]
    )) as LeveragedPool__factory;
    leveragedPool = await leveragedPoolFactory.deploy();
    await leveragedPool.deployed();

    // Sanity check the deployment
    expect(
      await leveragedPool.hasRole(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(ADMIN_ROLE)),
        signers[0].address
      )
    ).to.eq(true);
    expect(
      await leveragedPool.hasRole(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(UPDATER_ROLE)),
        signers[0].address
      )
    ).to.eq(true);
  });

  it("should set the quote token", async () => {
    await initialisePool(leveragedPool);
  });

  it("should set the last price", async () => {
    throw new Error();
  });

  it("should set the last price timestamp", async () => {
    throw new Error();
  });

  it("should set the fee address", async () => {
    throw new Error();
  });

  it("should set the update interval", async () => {
    throw new Error();
  });

  it("should set the front running interval", async () => {
    throw new Error();
  });

  it("should set the leverage amount", async () => {
    throw new Error();
  });

  it("should set the fee", async () => {
    throw new Error();
  });

  it("should set the pool code", async () => {
    throw new Error();
  });

  it("should revert if an attempt is made to run it a second time", async () => {
    throw new Error();
  });

  it("should revert if quoteToken address is the zero address", async () => {
    throw new Error();
  });

  it("should revert if the fee address is the zero address", async () => {
    throw new Error();
  });

  it("should revert if the front running interval is larger than the update interval", async () => {
    throw new Error();
  });
  it("should grant the FEE_HOLDER role to the fee address", async () => {});

  it("should deploy two ERC20 tokens for the long/short pairs", async () => {
    // Check tokens array. Index 0 must be the LONG token, and index 1 the SHORT token.
  });

  it("should emit an event containing the details of the new pool", async () => {});
});
