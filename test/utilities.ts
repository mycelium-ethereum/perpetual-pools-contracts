import { ethers } from "hardhat";
import { ContractReceipt, Event } from "ethers";
import { Result } from "ethers/lib/utils";
import {
  LeveragedPool,
  TestPoolFactory__factory,
  TestToken,
  TestToken__factory,
} from "../typechain";

import { abi as Pool } from "../artifacts/contracts/implementation/LeveragedPool.sol/LeveragedPool.json";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

/**
 * Generates a random ethereum address
 * @returns A valid ethereum address, generated randomly
 */
export const generateRandomAddress = () => {
  return ethers.utils.getAddress(
    ethers.utils.hexlify(ethers.utils.randomBytes(20))
  );
};

/**
 * Generates a random integer between min and max, inclusive.
 * @param min The minimum value
 * @param max The maximum value
 * @returns Number The random integer
 */
export const getRandomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min) + min);

/**
 * Extracts the arguments from the first event to match eventType.
 * @param txReceipt the transaction receipt to process for events
 * @param eventType the event name to select
 * @returns Result the arguments
 */
export const getEventArgs = (
  txReceipt: ContractReceipt | undefined,
  eventType: string | undefined
): Result | undefined => {
  return txReceipt?.events?.find((el: Event) => el.event === eventType)?.args;
};

export const deployPoolAndTokenContracts = async (
  POOL_CODE: string,
  lastPrice: number,
  updateInterval: number,
  frontRunningInterval: number,
  fee: number,
  leverage: number,
  feeAddress: string,
  amountMinted: number
): Promise<{
  signers: SignerWithAddress[];
  pool: LeveragedPool;
  token: TestToken;
}> => {
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
    getEventArgs(factoryReceipt, "CreatePool")?.pool,
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
