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
import { POOL_CODE } from "../constants";
import { generateRandomAddress, getRandomInt } from "../utilities";

import { abi as Pool } from "../../artifacts/contracts/implementation/LeveragedPool.sol/LeveragedPool.json";
import { Event } from "ethers";

chai.use(chaiAsPromised);
const { expect } = chai;

const amountCommitted = getRandomInt(2000, 1);
const amountMinted = getRandomInt(50000, 10000);
const feeAddress = generateRandomAddress();
const lastPrice = getRandomInt(99999999, 1);
const updateInterval = getRandomInt(99999, 10);
const frontRunningInterval = getRandomInt(updateInterval - 1, 1);
const fee = getRandomInt(256, 1);
const leverage = getRandomInt(256, 1);
const imbalance = getRandomInt(99999999, 1);
const commitType = [getRandomInt(3, 0)];
console.log(
  amountCommitted,
  amountMinted,
  feeAddress,
  lastPrice,
  updateInterval,
  frontRunningInterval,
  fee,
  leverage,
  imbalance,
  commitType
);

const createContracts = async () => {
  const signers = await ethers.getSigners();
  // Deploy test ERC20 token
  const testToken = (await ethers.getContractFactory(
    "TestToken",
    signers[0]
  )) as TestToken__factory;
  const token = await testToken.deploy("TEST TOKEN", "TST1");
  await token.deployed();
  await token.mint(amountMinted, signers[0].address);

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
      (el: Event) => el.event === "CreatePool"
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
  describe("Create commit", () => {
    let receipt: any;
    before(async () => {
      const result = await createContracts();
      signers = result.signers;
      pool = result.pool;
      token = result.token;

      await token.approve(pool.address, amountCommitted);
      receipt = await (
        await pool.commit(commitType, imbalance, amountCommitted)
      ).wait();
    });
    it("should create a commit entry", async () => {
      expect(
        (await pool.commits(getCommitEventArgs(receipt).commitID)).created
      ).to.not.eq(0);
    });
    it("should increment the id counter", async () => {
      expect((await pool.commitIDCounter()).eq(ethers.BigNumber.from(1))).to.eq(
        true
      );
    });
    it("should set the amount committed", async () => {
      expect(
        (await pool.commits(getCommitEventArgs(receipt).commitID)).amount
      ).to.eq(amountCommitted);
      expect(await token.balanceOf(signers[0].address)).to.eq(
        amountMinted - amountCommitted
      );
      expect(await token.balanceOf(pool.address)).to.eq(amountCommitted);
    });
    it("should allocate a unique ID for each request", async () => {
      await token.approve(pool.address, amountCommitted);
      const secondCommit = await (
        await pool.commit(commitType, imbalance, amountCommitted)
      ).wait();
      expect(getCommitEventArgs(receipt).commitID).to.not.eq(
        getCommitEventArgs(secondCommit).commitID
      );
    });

    it("should set a timestamp for each commit", async () => {
      expect(
        (await pool.commits(getCommitEventArgs(receipt).commitID)).created
      ).to.not.eq(0);
    });

    it("should set the user's maximum imbalance tolerance", async () => {
      expect(
        (await pool.commits(getCommitEventArgs(receipt).commitID)).maxImbalance
      ).to.eq(imbalance);
    });

    it("should set the commit's owner", async () => {
      expect(
        (await pool.commits(getCommitEventArgs(receipt).commitID)).owner
      ).to.eq(signers[0].address);
    });

    it("should set the commit type", async () => {
      expect(
        (await pool.commits(getCommitEventArgs(receipt).commitID)).commitType
      ).to.eq(commitType[0]);
    });

    it("should emit an event with details of the commit", async () => {
      expect(getCommitEventArgs(receipt).commitType).to.eq(commitType[0]);
      expect(getCommitEventArgs(receipt).amount).to.eq(amountCommitted);
      expect(
        getCommitEventArgs(receipt).commitID.gt(ethers.BigNumber.from(0))
      ).to.eq(true);
      expect(getCommitEventArgs(receipt).maxImbalance).to.eq(imbalance);
    });
  });

  describe("Shadow balance updating", () => {
    beforeEach(async () => {
      const result = await createContracts();
      signers = result.signers;
      pool = result.pool;
      token = result.token;

      await token.approve(pool.address, amountCommitted);
    });
    it("should update the shadow short mint balance for short mint commits", async () => {
      expect(await pool.shadowPools([0])).to.eq(0);
      await pool.commit([0], imbalance, amountCommitted);

      expect(await pool.shadowPools([0])).to.eq(amountCommitted);
    });

    it("should update the shadow short burn balance for short burn commits", async () => {
      expect(await pool.shadowPools([1])).to.eq(0);
      await pool.commit([1], imbalance, amountCommitted);

      expect(await pool.shadowPools([1])).to.eq(amountCommitted);
    });
    it("should update the shadow long mint balance for long mint commits", async () => {
      expect(await pool.shadowPools([2])).to.eq(0);
      await pool.commit([2], imbalance, amountCommitted);

      expect(await pool.shadowPools([2])).to.eq(amountCommitted);
    });

    it("should update the shadow long burn balance for long burn commits", async () => {
      expect(await pool.shadowPools([3])).to.eq(0);
      await pool.commit([3], imbalance, amountCommitted);

      expect(await pool.shadowPools([3])).to.eq(amountCommitted);
    });
  });
});
