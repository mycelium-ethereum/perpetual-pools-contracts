import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { generateRandomAddress } from "../utilities";

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
import { BigNumber, BigNumberish } from "ethers";

chai.use(chaiAsPromised);
const { expect } = chai;

let quoteToken: string;
let oracleWrapper: TestOracleWrapper;
let poolKeeper: PoolKeeper;

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
  await poolKeeper.createPool(
    MARKET,
    POOL_CODE,
    2,
    1,
    "0x00000000000000000000000000000000",
    1,
    generateRandomAddress(),
    quoteToken
  );
  await poolKeeper.createPool(
    MARKET,
    POOL_CODE_2,
    2,
    1,
    "0x00000000000000000000000000000000",
    2,
    generateRandomAddress(),
    quoteToken
  );
};
const callData = ethers.utils.defaultAbiCoder.encode(
  [
    ethers.utils.ParamType.from("string"),
    ethers.utils.ParamType.from("string[]"),
  ],
  [MARKET, [POOL_CODE, POOL_CODE_2]]
);
describe("PoolKeeper - performUpkeep", () => {
  let blockNumber: BigNumber;
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
      blockNumber = await oracleWrapper.getPrice(MARKET);
      await poolKeeper.performUpkeep(callData);
      await poolKeeper.performUpkeep(callData);
      await poolKeeper.performUpkeep(callData);
      await poolKeeper.performUpkeep(callData);
      await poolKeeper.performUpkeep(callData);
    });
    it("should update the cumulative price for the market+pools in performData", async () => {
      expect(
        await poolKeeper.cumulativePrices(
          MARKET.concat(".", POOL_CODE, POOL_CODE_2)
        )
      ).to.eq(blockNumber.add(5));
    });
    it("should update the count for the market+pools in performData", async () => {
      expect(
        await poolKeeper.counts(MARKET.concat(".", POOL_CODE, POOL_CODE_2))
      ).to.eq(5);
    });
  });
  describe("Upkeep - Price execution", () => {
    before(async () => {
      // Check starting conditions

      await setupHook();
      blockNumber = await oracleWrapper.getPrice(MARKET);
    });
    it("should call the triggerPriceUpdate function with the average price", async () => {
      throw new Error("Not Implemented");
    });
    it("should include the latest price in the average calculation", async () => {
      throw new Error("Not Implemented");
    });
    it("should reset the count for the market+pools in performData", async () => {
      expect(
        await poolKeeper.counts(MARKET.concat(".", POOL_CODE, POOL_CODE_2))
      ).to.eq(0);
    });
    it("should reset the cumulative price for the market+pools in perform data", async () => {
      expect(
        await poolKeeper.cumulativePrices(
          MARKET.concat(".", POOL_CODE, POOL_CODE_2)
        )
      ).to.eq(0);
    });
  });
});
