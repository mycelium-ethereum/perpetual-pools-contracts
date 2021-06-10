import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  ERC20,
  LeveragedPool,
  PoolSwapLibrary,
  TestToken,
} from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  getEventArgs,
  deployPoolAndTokenContracts,
  generateRandomAddress,
  getRandomInt,
  timeout,
  createCommit,
} from "../utilities";

import { BigNumberish, BytesLike, ContractReceipt } from "ethers";
import { POOL_CODE } from "../constants";

chai.use(chaiAsPromised);
const { expect } = chai;

const amountCommitted = ethers.utils.parseEther("2000");
const amountMinted = ethers.utils.parseEther("10000");
const feeAddress = generateRandomAddress();
const fee = "0x3ff947ae147ae147ae147ae147ae147a"; // 2% per execution. An IEEE 754 quadruple precision number
const lastPrice = 77000000;
const updateInterval = 2; // 2 seconds
const frontRunningInterval = 1;
const leverage = 10;
let imbalance: BytesLike;

let library: PoolSwapLibrary;
let pool: LeveragedPool;
let quoteToken: ERC20;
let signers: SignerWithAddress[];

/**
 * Deploys the pool
 */
const setupHook = async () => {
  // Deploy leveraged pool
  const result = await deployPoolAndTokenContracts(
    POOL_CODE,
    lastPrice,
    updateInterval,
    frontRunningInterval,
    fee, // Max safe value for JS is 9e15, this is always less than 1e13
    leverage,
    feeAddress,
    amountMinted
  );
  library = result.library;
  pool = result.pool;
  quoteToken = result.token;
  signers = result.signers;
  await quoteToken.approve(pool.address, amountMinted);
};

/**
 * Adds 2000 quote tokens to each pool
 */
const fundPools = async () => {
  imbalance = await library.convertUIntToDecimal(
    ethers.utils.parseEther("2001")
  );
  const shortMint = await createCommit(pool, [0], imbalance, amountCommitted);
  const longMint = await createCommit(pool, [2], imbalance, amountCommitted);
  await timeout(2000);
  await pool.executePriceChange(lastPrice);
  await pool.executeCommitment([shortMint.commitID, longMint.commitID]);
  expect((await pool.shortBalance()).toString()).to.eq(
    amountCommitted.toString()
  );
  expect((await pool.longBalance()).toString()).to.eq(
    amountCommitted.toString()
  );
};

describe("LeveragedPool - executePriceUpdate", () => {
  describe("Base cases", () => {
    beforeEach(async () => {
      await setupHook();
      await fundPools();
    });
    it("should set the last update timestamp", async () => {
      const firstTimestamp = await pool.lastPriceTimestamp();
      await pool.executePriceChange(1);
      expect((await pool.lastPriceTimestamp()).toNumber()).to.be.greaterThan(
        firstTimestamp.toNumber()
      );
    });
    it("should set the last price", async () => {
      const firstPrice = await pool.lastPrice();
      await pool.executePriceChange(5);
      const lastPrice = (await pool.lastPrice()).toNumber();
      expect(lastPrice).to.eq(5);
      expect(firstPrice.toNumber()).not.to.eq(lastPrice);
    });
    it("should send the fund movement fee to the fee holder", async () => {
      expect(await quoteToken.balanceOf(feeAddress)).to.eq(0);
      const newPrice = lastPrice * 2;

      await pool.executePriceChange(newPrice);
      expect(await quoteToken.balanceOf(feeAddress)).to.eq(
        (
          await library.convertDecimalToUInt(
            await library.multiplyDecimalByUInt(fee, amountCommitted)
          )
        ).mul(2)
      );
    });
  });
  describe("Exception cases", () => {
    beforeEach(setupHook);
    it("should revert if the update is too soon from the previous one", async () => {
      await pool.executePriceChange(9);
      await expect(pool.executePriceChange(10)).to.be.rejectedWith(Error);
    });
    it("should only update the price and timestamp if the losing pool balance is zero", async () => {
      const oldPrice = await pool.lastPrice();
      const oldTimestamp = await pool.lastPriceTimestamp();
      await pool.executePriceChange(78000000);
      expect(await pool.lastPrice()).not.to.eq(oldPrice);
      expect(await pool.lastPrice()).to.eq(ethers.BigNumber.from(78000000));
      expect((await pool.lastPriceTimestamp()).toNumber()).to.be.greaterThan(
        oldTimestamp.toNumber()
      );
    });
  });
  describe("Movement to long pool", () => {
    // const feeAmount: BigNumberish = fee.mul(amountCommitted.mul(2));
    before(async () => {
      await setupHook();
      await fundPools();
      // Increase price by 25%
      await pool.executePriceChange(
        ethers.BigNumber.from(lastPrice).add(1000000)
      );
    });
    it("should update the short pair balance", async () => {
      throw new Error("Not Implemented");
    });
    it("should update the long pair balance", async () => {
      throw new Error("Not Implemented");
    });
  });
  describe("Movement to short pool", () => {
    before(async () => {
      await setupHook();
      await fundPools();
      // Increase price by 25%
      await pool.executePriceChange(
        ethers.BigNumber.from(lastPrice).sub(1000000)
      );
    });
    it("should update the short pair balance", async () => {
      throw new Error("Not Implemented");
    });
    it("should update the long pair balance", async () => {
      throw new Error("Not Implemented");
    });
  });
});
