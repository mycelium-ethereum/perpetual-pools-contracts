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
