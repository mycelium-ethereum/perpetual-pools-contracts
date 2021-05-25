import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { LeveragedPool__factory, LeveragedPool } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ADMIN_ROLE,
  FEE_HOLDER_ROLE,
  POOL_CODE,
  UPDATER_ROLE,
} from "../constants";
import { generateRandomAddress } from "../utilities";

chai.use(chaiAsPromised);
const { expect } = chai;

const getRandomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min) + min);

const quoteToken = generateRandomAddress();
const feeAddress = generateRandomAddress();
const lastPrice = getRandomInt(9999999999, 1);
const updateInterval = getRandomInt(99999, 10);
const frontRunningInterval = getRandomInt(updateInterval - 1, 1);
const fee = getRandomInt(256, 1);
const leverage = getRandomInt(256, 1);

const initialisePool = (
  pool: LeveragedPool,
  poolCode: string,
  lastPrice: number,
  updateInterval: number,
  frontRunningInterval: number,
  fee: number,
  leverageAmount: number,
  feeAddress: string,
  quoteToken: string
) => {
  return pool.initialize(
    poolCode,
    lastPrice,
    updateInterval,
    frontRunningInterval,
    fee,
    leverageAmount,
    feeAddress,
    quoteToken
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
  });

  it("should set the quote token", async () => {
    await initialisePool(
      leveragedPool,
      POOL_CODE,
      lastPrice,
      updateInterval,
      frontRunningInterval,
      fee,
      leverage,
      feeAddress,
      quoteToken
    );
    expect(await leveragedPool.quoteToken()).to.eq(quoteToken);
  });

  it("should set the last price", async () => {
    await initialisePool(
      leveragedPool,
      POOL_CODE,
      lastPrice,
      updateInterval,
      frontRunningInterval,
      fee,
      leverage,
      feeAddress,
      quoteToken
    );
    expect(await leveragedPool.lastPrice()).to.eq(lastPrice);
  });

  it("should set the last price timestamp", async () => {
    await initialisePool(
      leveragedPool,
      POOL_CODE,
      lastPrice,
      updateInterval,
      frontRunningInterval,
      fee,
      leverage,
      feeAddress,
      quoteToken
    );
    expect(await leveragedPool.lastPriceTimestamp()).to.not.eq(0);
  });

  it("should set the fee address", async () => {
    await initialisePool(
      leveragedPool,
      POOL_CODE,
      lastPrice,
      updateInterval,
      frontRunningInterval,
      fee,
      leverage,
      feeAddress,
      quoteToken
    );
    expect(await leveragedPool.feeAddress()).to.eq(feeAddress);
  });

  it("should set the update interval", async () => {
    await initialisePool(
      leveragedPool,
      POOL_CODE,
      lastPrice,
      updateInterval,
      frontRunningInterval,
      fee,
      leverage,
      feeAddress,
      quoteToken
    );
    expect(await leveragedPool.updateInterval()).to.eq(updateInterval);
  });

  it("should set the front running interval", async () => {
    await initialisePool(
      leveragedPool,
      POOL_CODE,
      lastPrice,
      updateInterval,
      frontRunningInterval,
      fee,
      leverage,
      feeAddress,
      quoteToken
    );
    expect(await leveragedPool.frontRunningInterval()).to.eq(
      frontRunningInterval
    );
  });

  it("should set the leverage amount", async () => {
    await initialisePool(
      leveragedPool,
      POOL_CODE,
      lastPrice,
      updateInterval,
      frontRunningInterval,
      fee,
      leverage,
      feeAddress,
      quoteToken
    );
    expect(await leveragedPool.leverageAmount()).to.eq(leverage);
  });

  it("should set the fee", async () => {
    await initialisePool(
      leveragedPool,
      POOL_CODE,
      lastPrice,
      updateInterval,
      frontRunningInterval,
      fee,
      leverage,
      feeAddress,
      quoteToken
    );
    expect(await leveragedPool.fee()).to.eq(fee);
  });

  it("should set the pool code", async () => {
    await initialisePool(
      leveragedPool,
      POOL_CODE,
      lastPrice,
      updateInterval,
      frontRunningInterval,
      fee,
      leverage,
      feeAddress,
      quoteToken
    );
    expect(await leveragedPool.poolCode()).to.eq(POOL_CODE);
  });
  it("should deploy two ERC20 tokens for the long/short pairs", async () => {
    // Check tokens array. Index 0 must be the LONG token, and index 1 the SHORT token.
    throw new Error("Not Implemented");
  });
  it("should revert if an attempt is made to run it a second time", async () => {
    await initialisePool(
      leveragedPool,
      POOL_CODE,
      lastPrice,
      updateInterval,
      frontRunningInterval,
      fee,
      leverage,
      feeAddress,
      quoteToken
    );
    await expect(
      initialisePool(
        leveragedPool,
        POOL_CODE,
        lastPrice,
        updateInterval,
        frontRunningInterval,
        fee,
        leverage,
        feeAddress,
        quoteToken
      )
    ).to.rejectedWith(Error);
  });

  it("should revert if quoteToken address is the zero address", async () => {
    await expect(
      initialisePool(
        leveragedPool,
        POOL_CODE,
        lastPrice,
        updateInterval,
        frontRunningInterval,
        fee,
        leverage,
        feeAddress,
        ethers.constants.AddressZero
      )
    ).to.rejectedWith(Error);
  });

  it("should revert if the fee address is the zero address", async () => {
    await expect(
      initialisePool(
        leveragedPool,
        POOL_CODE,
        lastPrice,
        updateInterval,
        frontRunningInterval,
        fee,
        leverage,
        ethers.constants.AddressZero,
        quoteToken
      )
    ).to.rejectedWith(Error);
  });

  it("should revert if the front running interval is larger than the update interval", async () => {
    await expect(
      initialisePool(
        leveragedPool,
        POOL_CODE,
        lastPrice,
        1,
        2,
        fee,
        leverage,
        feeAddress,
        quoteToken
      )
    ).to.rejectedWith(Error);
  });
  it("should grant the FEE_HOLDER role to the fee address", async () => {
    await initialisePool(
      leveragedPool,
      POOL_CODE,
      lastPrice,
      updateInterval,
      frontRunningInterval,
      fee,
      leverage,
      feeAddress,
      quoteToken
    );
    expect(
      await leveragedPool.hasRole(
        ethers.utils.keccak256(FEE_HOLDER_ROLE),
        feeAddress
      )
    ).to.eq(true);
  });
  it("should grant the UPDATER role to the deployer", async () => {
    await initialisePool(
      leveragedPool,
      POOL_CODE,
      lastPrice,
      updateInterval,
      frontRunningInterval,
      fee,
      leverage,
      feeAddress,
      quoteToken
    );
    expect(
      await leveragedPool.hasRole(
        ethers.utils.keccak256(UPDATER_ROLE),
        signers[0].address
      )
    ).to.eq(true);
  });
  it("should grant the ADMIN role to the deployer", async () => {
    await initialisePool(
      leveragedPool,
      POOL_CODE,
      lastPrice,
      updateInterval,
      frontRunningInterval,
      fee,
      leverage,
      feeAddress,
      quoteToken
    );
    expect(
      await leveragedPool.hasRole(
        ethers.utils.keccak256(ADMIN_ROLE),
        signers[0].address
      )
    ).to.eq(true);
  });

  it("should emit an event containing the details of the new pool", async () => {
    const receipt = await (
      await initialisePool(
        leveragedPool,
        POOL_CODE,
        lastPrice,
        updateInterval,
        frontRunningInterval,
        fee,
        leverage,
        feeAddress,
        quoteToken
      )
    ).wait();
    const event = receipt?.events?.find((el) => el.event === "PoolInitialised");
    expect(!!event).to.eq(true);

    expect(!!event?.args?.longToken).to.eq(true);
    expect(!!event?.args?.shortToken).to.eq(true);
    expect(event?.args?.quoteToken).to.eq(quoteToken);
    expect(event?.args?.poolCode).to.eq(POOL_CODE);
  });
});
