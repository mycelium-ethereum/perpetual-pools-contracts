import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { generateRandomAddress, timeout } from "../utilities";

import { MARKET_2, POOL_CODE } from "../constants";
import {
  PoolKeeper,
  PoolKeeper__factory,
  PoolSwapLibrary__factory,
  TestOracleWrapper,
  TestOracleWrapper__factory,
  TestToken__factory,
} from "../../typechain";
import { MARKET, POOL_CODE_2 } from "../constants";
import { BigNumber } from "ethers";

chai.use(chaiAsPromised);
const { expect } = chai;

let quoteToken: string;
let oracleWrapper: TestOracleWrapper;
let poolKeeper: PoolKeeper;
let blockNumber: BigNumber;
const updateInterval = 10;

const setupHook = async () => {
  const signers = await ethers.getSigners();

  // Deploy quote token
  const testToken = (await ethers.getContractFactory(
    "TestToken",
    signers[0]
  )) as TestToken__factory;
  const token = await testToken.deploy("TEST TOKEN", "TST1");
  await token.deployed();
  await token.mint(10000, signers[0].address);
  quoteToken = token.address;

  // Deploy oracle. Using a test oracle for predictability
  const oracleWrapperFactory = (await ethers.getContractFactory(
    "TestOracleWrapper",
    signers[0]
  )) as TestOracleWrapper__factory;
  oracleWrapper = await oracleWrapperFactory.deploy();
  await oracleWrapper.deployed();

  // Deploy pool keeper
  const libraryFactory = (await ethers.getContractFactory(
    "PoolSwapLibrary",
    signers[0]
  )) as PoolSwapLibrary__factory;
  const library = await libraryFactory.deploy();
  await library.deployed();
  const poolKeeperFactory = (await ethers.getContractFactory("PoolKeeper", {
    signer: signers[0],
    libraries: { PoolSwapLibrary: library.address },
  })) as PoolKeeper__factory;
  poolKeeper = await poolKeeperFactory.deploy(oracleWrapper.address);
  await poolKeeper.deployed();

  // Create pool
  await poolKeeper.createMarket(MARKET, oracleWrapper.address);
  await oracleWrapper.increasePrice();
  blockNumber = ethers.BigNumber.from(1);
  await poolKeeper.createPool(
    MARKET,
    POOL_CODE,
    updateInterval,
    1,
    "0x00000000000000000000000000000000",
    1,
    generateRandomAddress(),
    quoteToken
  );
  await oracleWrapper.increasePrice();
  await poolKeeper.createPool(
    MARKET,
    POOL_CODE_2,
    updateInterval,
    1,
    "0x00000000000000000000000000000000",
    2,
    generateRandomAddress(),
    quoteToken
  );
};
const callData = ethers.utils.defaultAbiCoder.encode(
  [
    ethers.utils.ParamType.from("uint32"),
    ethers.utils.ParamType.from("string"),
    ethers.utils.ParamType.from("string[]"),
  ],
  [updateInterval, MARKET, [POOL_CODE, POOL_CODE_2]]
);

interface Upkeep {
  cumulativePrice: BigNumber;
  lastSamplePrice: BigNumber;
  executionPrice: BigNumber;
  lastExecutionPrice: BigNumber;
  count: number;
  updateInterval: number;
  roundStart: number;
}
describe("PoolKeeper - performUpkeep", () => {
  describe("Base cases", () => {
    beforeEach(setupHook);
    it("should revert if performData is invalid", async () => {
      await expect(
        poolKeeper.performUpkeep(
          ethers.utils.defaultAbiCoder.encode(
            [
              ethers.utils.ParamType.from("string"),
              ethers.utils.ParamType.from("string[]"),
            ],
            [MARKET_2, [POOL_CODE, POOL_CODE_2]]
          )
        )
      ).to.be.rejectedWith(Error);
    });
  });
  describe("Upkeep - Price averaging", () => {
    before(async () => {
      // Check starting conditions
      await setupHook();
      await oracleWrapper.increasePrice();
      await poolKeeper.performUpkeep(callData);
      await oracleWrapper.increasePrice();
      await poolKeeper.performUpkeep(callData);
    });
    it("should update the cumulative price for the market+pools in performData", async () => {
      expect(
        (await poolKeeper.upkeep(MARKET, updateInterval)).cumulativePrice
      ).to.eq(blockNumber.add(2).add(3).add(4));
    });
    it("should update the count for the market+pools in performData", async () => {
      expect((await poolKeeper.upkeep(MARKET, updateInterval)).count).to.eq(4);
    });
  });
  describe("Upkeep - Price execution", () => {
    before(async () => {
      // Check starting conditions

      await setupHook();
    });
    it("should call the triggerPriceUpdate function with the average price", async () => {
      throw new Error("Not Implemented");
    });
    it("should include the latest price in the average calculation", async () => {
      throw new Error("Not Implemented");
    });
    it("should reset the count for the market+pools in performData", async () => {
      throw new Error("Not Implemented");
    });
    it("should reset the cumulative price for the market+pools in perform data", async () => {
      throw new Error("Not Implemented");
    });
  });
  describe("Upkeep - New round", () => {
    let oldRound: Upkeep;
    let newRound: Upkeep;
    before(async () => {
      // Check starting conditions
      await setupHook();
      // process a few upkeeps
      await oracleWrapper.increasePrice();
      await poolKeeper.performUpkeep(callData);
      await oracleWrapper.increasePrice();
      await poolKeeper.performUpkeep(callData);
      oldRound = await poolKeeper.upkeep(MARKET, updateInterval);
      // delay and upkeep again
      await timeout(updateInterval * 1000 + 1000);
      await poolKeeper.performUpkeep(callData);
      newRound = await poolKeeper.upkeep(MARKET, updateInterval);
    });
    it("should clear the old round data", async () => {
      const price = await oracleWrapper.getPrice(MARKET);
      expect(newRound.count).to.eq(1);
      expect(newRound.roundStart).to.be.greaterThan(oldRound.roundStart);
      expect(newRound.cumulativePrice).to.eq(price);
      expect(newRound.lastSamplePrice).to.eq(price);
    });
    it("should calculate a new execution price", async () => {
      expect(newRound.lastExecutionPrice).to.eq(oldRound.executionPrice);
      expect(newRound.executionPrice).to.eq(
        oldRound.cumulativePrice.mul(10000).div(oldRound.count).add(5).div(10)
      );
    });
  });
});
