import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { generateRandomAddress, getEventArgs, timeout } from "../../utilities";

import {
  PoolFactory__factory,
  PoolKeeper,
  PoolKeeper__factory,
  PoolSwapLibrary__factory,
  TestOracleWrapper,
  TestOracleWrapper__factory,
  TestToken__factory,
} from "../../../typechain";
import { MARKET, POOL_CODE_2, MARKET_2, POOL_CODE } from "../../constants";
import { BigNumber } from "ethers";
import { Result } from "ethers/lib/utils";

chai.use(chaiAsPromised);
const { expect } = chai;

let quoteToken: string;
let oracleWrapper: TestOracleWrapper;
let poolKeeper: PoolKeeper;
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
  })) as PoolKeeper__factory;
  const PoolFactory = (await ethers.getContractFactory("PoolFactory", {
    signer: signers[0],
    libraries: { PoolSwapLibrary: library.address },
  })) as PoolFactory__factory;
  const factory = await (await PoolFactory.deploy()).deployed();
  poolKeeper = await poolKeeperFactory.deploy(
    oracleWrapper.address,
    factory.address
  );
  await poolKeeper.deployed();

  // Create pool
  await poolKeeper.createMarket(MARKET, oracleWrapper.address);
  await oracleWrapper.increasePrice();

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
const upkeepOne = ethers.utils.defaultAbiCoder.encode(
  [
    ethers.utils.ParamType.from("uint32"),
    ethers.utils.ParamType.from("string"),
    ethers.utils.ParamType.from("string[]"),
  ],
  [updateInterval, MARKET, [POOL_CODE]]
);
const upkeepTwo = ethers.utils.defaultAbiCoder.encode(
  [
    ethers.utils.ParamType.from("uint32"),
    ethers.utils.ParamType.from("string"),
    ethers.utils.ParamType.from("string[]"),
  ],
  [updateInterval, MARKET, [POOL_CODE_2]]
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
describe("PoolKeeper - performUpkeep: corner cases", () => {
  let oldRound: Upkeep;
  let upkeepOneEvent: Result | undefined;
  let upkeepTwoEvent: Result | undefined;
  describe("Multiple upkeep groups for the same market", () => {
    beforeEach(async () => {
      await setupHook();

      // Sample and execute the first upkeep group
      await oracleWrapper.increasePrice();
      await poolKeeper.performUpkeep(upkeepOne);
      await poolKeeper.performUpkeep(upkeepTwo);
      await timeout(updateInterval * 1000 + 1000);

      const upOne = await (await poolKeeper.performUpkeep(upkeepOne)).wait();

      const upTwo = await (await poolKeeper.performUpkeep(upkeepTwo)).wait();
      upkeepOneEvent = getEventArgs(upOne, "ExecutePriceChange");
      upkeepTwoEvent = getEventArgs(upTwo, "ExecutePriceChange");
      oldRound = await poolKeeper.upkeep(MARKET, updateInterval);
    });
    it("should use the same price data for a second upkeep group in the same market", async () => {
      expect(upkeepOneEvent?.oldPrice).to.eq(oldRound.lastExecutionPrice);
      expect(upkeepTwoEvent?.oldPrice).to.eq(oldRound.lastExecutionPrice);
      expect(upkeepOneEvent?.newPrice).to.eq(oldRound.executionPrice);
      expect(upkeepTwoEvent?.newPrice).to.eq(oldRound.executionPrice);
    });
    it("should use the same price for a new round + execute transaction and an execution transaction that follows for a second upkeep group", async () => {
      await timeout(updateInterval * 1000 + 1000);

      const upOne = await (await poolKeeper.performUpkeep(upkeepOne)).wait();
      const upTwo = await (await poolKeeper.performUpkeep(upkeepTwo)).wait();
      upkeepOneEvent = getEventArgs(upOne, "ExecutePriceChange");
      upkeepTwoEvent = getEventArgs(upTwo, "ExecutePriceChange");
      expect(upkeepOneEvent?.newPrice).to.eq(upkeepTwoEvent?.newPrice);
      expect(upkeepOneEvent?.oldPrice).to.eq(upkeepTwoEvent?.oldPrice);
      expect(upkeepOneEvent?.market).to.eq(upkeepTwoEvent?.market);
      expect(upkeepOneEvent?.updateInterval).to.eq(
        upkeepTwoEvent?.updateInterval
      );
    });
  });
  describe("Malicious upkeep requests", () => {
    beforeEach(setupHook);
    it("should revert if the pools do not belong to the market", async () => {
      // Setup a malicious market
      await poolKeeper.createMarket(MARKET_2, oracleWrapper.address);
      const badPool = POOL_CODE.concat("BAD");
      await poolKeeper.createPool(
        MARKET_2,
        badPool,
        updateInterval,
        1,
        "0x00000000000000000000000000000000",
        1,
        generateRandomAddress(),
        quoteToken
      );
      await oracleWrapper.increasePrice();
      const goodData = ethers.utils.defaultAbiCoder.encode(
        [
          ethers.utils.ParamType.from("uint32"),
          ethers.utils.ParamType.from("string"),
          ethers.utils.ParamType.from("string[]"),
        ],
        [updateInterval, MARKET_2, [badPool]]
      );

      await poolKeeper.performUpkeep(goodData);

      await timeout(updateInterval * 1000 + 1000);
      await poolKeeper.performUpkeep(goodData);

      // Update a pool not in the malicious market
      await expect(
        poolKeeper.performUpkeep(
          ethers.utils.defaultAbiCoder.encode(
            [
              ethers.utils.ParamType.from("uint32"),
              ethers.utils.ParamType.from("string"),
              ethers.utils.ParamType.from("string[]"),
            ],
            [updateInterval, MARKET_2, [POOL_CODE]]
          )
        )
      ).to.be.rejectedWith(Error);
    });
  });
});
