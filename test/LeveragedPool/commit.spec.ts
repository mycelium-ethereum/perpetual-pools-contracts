import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  TestPoolFactory__factory,
  LeveragedPool,
  TestToken__factory,
  TestToken,
} from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MARKET, ORACLE, POOL_CODE } from "../constants";
import { generateRandomAddress, getRandomInt } from "../utilities";

import { abi as Pool } from "../../artifacts/contracts/implementation/LeveragedPool.sol/LeveragedPool.json";
import { Event, Transaction } from "ethers";

chai.use(chaiAsPromised);
const { expect } = chai;

let quoteToken;
const feeAddress = generateRandomAddress();
const lastPrice = getRandomInt(9999999999, 1);
const updateInterval = getRandomInt(99999, 10);
const frontRunningInterval = getRandomInt(updateInterval - 1, 1);
const fee = getRandomInt(256, 1);
const leverage = getRandomInt(256, 1);

const createContracts = async () => {
  const signers = await ethers.getSigners();
  // Deploy test ERC20 token
  const testToken = (await ethers.getContractFactory(
    "TestToken",
    signers[0]
  )) as TestToken__factory;
  const token = await testToken.deploy("TEST TOKEN", "TST1");
  await token.deployed();
  await token.mint(10000, signers[0].address);

  // Deploy and initialise pool

  const testFactory = (await ethers.getContractFactory(
    "TestPoolFactory",
    signers[0]
  )) as TestPoolFactory__factory;
  const testFactoryActual = await testFactory.deploy();
  await testFactoryActual.deployed();
  const factoryReceipt = await (
    await testFactoryActual.createPool(POOL_CODE)
  ).wait();

  const pool = new ethers.Contract(
    factoryReceipt?.events?.find(
      (el: any) => el.event === "CreatePool"
    )?.args?.pool,
    Pool,
    signers[0]
  ) as LeveragedPool;

  await pool.initialize(
    POOL_CODE,
    lastPrice,
    updateInterval,
    frontRunningInterval,
    fee,
    leverage,
    feeAddress,
    token.address
  );
  return { signers, pool, token };
};
const getCommitEventArgs = (txReceipt: any) => {
  return txReceipt?.events.find((el: Event) => el.event === "CreateCommit")
    .args;
};

describe("LeveragedPool - commit", () => {
  let pool: LeveragedPool;
  let signers: SignerWithAddress[];
  let token: TestToken;
  describe("Commit creation - all 4 types", () => {
    let commitReceipts: any[] = [];
    before(async () => {
      const result = await createContracts();
      signers = result.signers;
      pool = result.pool;
      token = result.token;

      await token.approve(pool.address, 9004); // Pool will pull the funds
      // Testing all 4 commit types: ShortMint, ShortBurn, LongMint, LongBurn
      commitReceipts.push(
        await (
          await pool.commit(ethers.utils.toUtf8Bytes("0"), 10, 2251)
        ).wait()
      );
      commitReceipts.push(
        await (
          await pool.commit(ethers.utils.toUtf8Bytes("1"), 10, 2251)
        ).wait()
      );
      commitReceipts.push(
        await (
          await pool.commit(ethers.utils.toUtf8Bytes("2"), 10, 2251)
        ).wait()
      );
      commitReceipts.push(
        await (
          await pool.commit(ethers.utils.toUtf8Bytes("3"), 10, 2251)
        ).wait()
      );
    });
    it("should create a commit entry", async () => {
      expect(
        (await pool.commits(getCommitEventArgs(commitReceipts[0]).commitID))
          .created
      ).to.not.eq(0);
      expect(
        (await pool.commits(getCommitEventArgs(commitReceipts[1]).commitID))
          .created
      ).to.not.eq(0);
      expect(
        (await pool.commits(getCommitEventArgs(commitReceipts[2]).commitID))
          .created
      ).to.not.eq(0);
      expect(
        (await pool.commits(getCommitEventArgs(commitReceipts[3]).commitID))
          .created
      ).to.not.eq(0);
    });

    it("should allocate a unique ID for each request", async () => {});

    it("should set a timestamp for each commit", async () => {});

    it("should set the amount committed", async () => {});

    it("should set the user's maximum imbalance tolerance", async () => {});

    it("should set the commit's owner", async () => {});

    it("should set the commit type", async () => {});

    it("should emit an event with details of the commit", async () => {});
  });

  describe("Shadow balance updating", () => {
    beforeEach(async () => {
      const result = await createContracts();
      signers = result.signers;
      pool = result.pool;
      token = result.token;
    });

    it("should update the shadow long mint balance for long mint commits", async () => {});

    it("should update the shadow long burn balance for long burn commits", async () => {});

    it("should update the shadow short mint balance for short mint commits", async () => {});

    it("should update the shadow short burn balance for short burn commits", async () => {});
  });
});
