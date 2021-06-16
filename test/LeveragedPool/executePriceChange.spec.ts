import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ERC20, LeveragedPool, PoolSwapLibrary } from "../../typechain";

import {
  deployPoolAndTokenContracts,
  generateRandomAddress,
  timeout,
  createCommit,
} from "../utilities";

import { BigNumberish, BytesLike } from "ethers";
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
    fee,
    leverage,
    feeAddress,
    amountMinted
  );
  library = result.library;
  pool = result.pool;
  quoteToken = result.token;

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
const calculateFee = async (fee: string, amount: BigNumberish) => {
  return await library.convertDecimalToUInt(
    await library.multiplyDecimalByUInt(fee, amount)
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
        (await calculateFee(fee, amountCommitted)).mul(2)
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
    beforeEach(async () => {
      await setupHook();
      await fundPools();
    });
    it("should update the short pair balance", async () => {
      expect(await pool.shortBalance()).to.eq(amountCommitted);
      // Increase price by 1 cent
      await pool.executePriceChange(
        ethers.BigNumber.from(lastPrice).add(1000000)
      );
      expect(await pool.shortBalance()).to.eq(
        ethers.BigNumber.from("1722730315330386595645")
      );
    });
    it("should update the long pair balance", async () => {
      expect(await pool.longBalance()).to.eq(ethers.utils.parseEther("2000"));
      // Increase price by 1 cent
      await pool.executePriceChange(
        ethers.BigNumber.from(lastPrice).add(1000000)
      );
      expect(await pool.longBalance()).to.eq(
        amountCommitted
          .sub(await calculateFee(fee, amountCommitted))
          .add(
            amountCommitted.sub(
              ethers.BigNumber.from("1722730315330386595645").add(
                await calculateFee(fee, amountCommitted)
              )
            )
          )
      );
    });
  });
  describe("Movement to short pool", () => {
    beforeEach(async () => {
      await setupHook();
      await fundPools();
    });
    it("should update the short pair balance", async () => {
      expect(await pool.shortBalance()).to.eq(ethers.utils.parseEther("2000"));
      // Increase price by 1 cent
      await pool.executePriceChange(
        ethers.BigNumber.from(lastPrice).sub(1000000)
      );
      expect(await pool.shortBalance()).to.eq(
        amountCommitted
          .sub(await calculateFee(fee, amountCommitted))
          .add(
            amountCommitted.sub(
              ethers.BigNumber.from("1719826919507855595287").add(
                await calculateFee(fee, amountCommitted)
              )
            )
          )
      );
    });
    it("should update the long pair balance", async () => {
      expect(await pool.longBalance()).to.eq(amountCommitted);
      // Increase price by 1 cent
      await pool.executePriceChange(
        ethers.BigNumber.from(lastPrice).sub(1000000)
      );
      expect(await pool.longBalance()).to.eq(
        ethers.BigNumber.from("1719826919507855595287")
      );
    });
  });
});