#!/usr/bin/env node
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const hardhat = require("hardhat");
const ethers = hardhat.ethers;
import {
  PoolKeeper__factory,
  OracleWrapper,
  PoolSwapLibrary__factory,
  PoolFactory__factory,
  OracleWrapper__factory,
} from "../typechain";
import { abi as OracleWrapperABI } from "../artifacts/contracts/implementation/OracleWrapper.sol/OracleWrapper.json";

let deployer: SignerWithAddress;

export const deployPoolSwapLibrary = async (): Promise<string> => {
  if (!deployer) {
    deployer = (await ethers.getSigners())[0];
  }
  const factory = (await ethers.getContractFactory(
    "PoolSwapLibrary",
    deployer
  )) as PoolSwapLibrary__factory;
  return (await (await factory.deploy()).deployed()).address;
};

/**
 * Deploys an instance of the PoolFactory contract
 * @returns string  The address of the newly deployed factory
 */
export const deployPoolFactory = async (
  libraryAddress: string
): Promise<string> => {
  if (!deployer) {
    deployer = (await ethers.getSigners())[0];
  }
  const factory = (await ethers.getContractFactory("PoolFactory", {
    signer: deployer,
    libraries: { PoolSwapLibrary: libraryAddress },
  })) as PoolFactory__factory;
  return (await (await factory.deploy()).deployed()).address;
};

/**
 * Deploys an instance of the OracleWrapper contract
 * @returns string  The address of the new oracle wrapper
 */
export const deployOracleWrapper = async (): Promise<string> => {
  if (!deployer) {
    deployer = (await ethers.getSigners())[0];
  }
  const factory = (await ethers.getContractFactory("OracleWrapper", {
    signer: deployer,
  })) as OracleWrapper__factory;

  return (await (await factory.deploy()).deployed()).address;
};

/**
 * Deploys an instance of the PoolKeeper contract and grants the operator role to it in the oracle wrapper
 * @param oracleWrapperAddress  The address of the oracle wrapper to use when creating markets
 * @param factoryAddress  The address of the factory to use when creating pools
 * @returns string  The address of the pool keeper instance
 */
export const deployPoolKeeper = async (
  oracleWrapperAddress: string,
  factoryAddress: string
): Promise<string> => {
  if (!deployer) {
    deployer = (await ethers.getSigners())[0];
  }
  const factory = (await ethers.getContractFactory("PoolKeeper", {
    signer: deployer,
  })) as PoolKeeper__factory;

  const poolKeeperAddress = (
    await (
      await factory.deploy(oracleWrapperAddress, factoryAddress)
    ).deployed()
  ).address;

  // Grant permission for the new keeper to add markets to the oracle wrapper
  const oracle = new ethers.Contract(
    oracleWrapperAddress,
    OracleWrapperABI,
    deployer
  ) as OracleWrapper;
  const operatorRole = await oracle.OPERATOR();
  await oracle.grantRole(operatorRole, poolKeeperAddress);

  return poolKeeperAddress;
};

/**
 * Verifies a contract on etherscan
 * @param address The address of the deployed contract
 * @param constructorArguments The constructor arguments that the contract was deployed with
 * @param libraries  A library object to properly verify linking with. See https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html#libraries-with-undetectable-addresses. Looks like {SomeLibrary:"0x1234"}
 */
export const verifyOnEtherscan = async (
  address: string,
  constructorArguments: any[],
  libraries?: any | undefined
) => {
  await hardhat.run("verify:verify", {
    address,
    constructorArguments,
    libraries,
  });
};
