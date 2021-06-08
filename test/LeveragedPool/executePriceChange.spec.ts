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
} from "../utilities";

import { BytesLike, ContractReceipt } from "ethers";
import { POOL_CODE } from "../constants";

chai.use(chaiAsPromised);
const { expect } = chai;

const amountCommitted = ethers.utils.parseEther("2000");
const amountMinted = ethers.utils.parseEther("10000");
const feeAddress = generateRandomAddress();
const lastPrice = 77632500;
const updateInterval = 2; // 2 seconds
const frontRunningInterval = 1;
const fee = ethers.BigNumber.from(0.2e12).div((365 * 24 * 60 * 60) / 15); // 15 second update interval at 2% per annum
const leverage = 1;
let imbalance: BytesLike;
const commitType = [0]; // Short mint

let library: PoolSwapLibrary;
let pool: LeveragedPool;
let quoteToken: ERC20;
let shortToken: ERC20;
let longToken: ERC20;
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
    fee,
    leverage,
    feeAddress,
    amountMinted
  );
  library = result.library;
  pool = result.pool;
  quoteToken = result.token;
  shortToken = result.shortToken;
  longToken = result.longToken;
  signers = result.signers;
};

/**
 * Adds 2000 quote tokens to each pool
 */
const fundPools = async () => {};

describe("LeveragedPool - executePriceUpdate", () => {
  describe("Base cases", () => {
    before(async () => {
      await setupHook();
      await fundPools();
    });
    it("should set the last update timestamp", async () => {
      const firstTimestamp = await pool.lastPriceTimestamp();
      await pool.executePriceChange(1);
      expect(
        new Date((await pool.lastPriceTimestamp).toString()).valueOf()
      ).to.be.greaterThan(new Date(firstTimestamp.toString()).valueOf());
    });
    it("should set the last underlying price", async () => {
      const firstPrice = await pool.lastPrice();
      await pool.executePriceChange(5);
      const lastPrice = (await pool.lastPrice()).toNumber();
      expect(lastPrice).to.eq(5);
      expect(firstPrice.toNumber()).not.to.eq(lastPrice);
    });
    it("should send the fund movement fee to the fee holder", async () => {
      expect(await quoteToken.balanceOf(feeAddress)).to.eq(0);
      const newPrice = lastPrice * 2;
      const feeAmount = fee.mul(amountCommitted.mul(2));
      await pool.executePriceChange(newPrice);
      expect(await quoteToken.balanceOf(feeAddress)).to.eq(feeAmount);
    });
  });
  describe("Revert cases", () => {
    beforeEach(setupHook);
    it("should revert if the update is too soon from the previous one", async () => {
      await pool.executePriceChange(9);
      await expect(pool.executePriceChange(10)).to.be.rejectedWith(Error);
    });
    it("should revert if the losing pool balance is zero", async () => {
      await expect(pool.executePriceChange(lastPrice * 2)).to.be.rejectedWith(
        Error
      );
    });
  });
  describe("Movement to long pool", () => {
    before(async () => {
      await setupHook();
      await fundPools();
    });
    it("should update the short pair balance", async () => {});
    it("should update the long pair balance", async () => {});
  });
  describe("Movement to short pool", () => {
    before(async () => {
      await setupHook();
      await fundPools();
    });
    it("should update the short pair balance", async () => {});
    it("should update the long pair balance", async () => {});
  });
});
