import { ethers } from "hardhat";
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
