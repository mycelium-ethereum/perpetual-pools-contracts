import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { LeveragedPool, TestToken } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { POOL_CODE } from "../constants";
import {
  getEventArgs,
  deployPoolAndTokenContracts,
  getRandomInt,
  generateRandomAddress,
} from "../utilities";

import { ContractReceipt } from "ethers";

chai.use(chaiAsPromised);
const { expect } = chai;

const amountCommitted = getRandomInt(2000, 1);
const amountMinted = getRandomInt(50000, 10000);
const feeAddress = generateRandomAddress();
const lastPrice = getRandomInt(99999999, 1);
const updateInterval = getRandomInt(99999, 10);
const frontRunningInterval = getRandomInt(updateInterval - 1, 1);
const fee = getRandomInt(256, 1);
const leverage = getRandomInt(256, 1);
const imbalance = getRandomInt(99999999, 1);
const commitType = [getRandomInt(3, 0)];

describe("LeveragedPool - executeCommitment", () => {
  describe("Single commitment", () => {
    it("should revert if the commitment is too new", async () => {});
    it("should revert if the max imbalance is less than the current balance of the pairs", async () => {});
    it("should revert if the commitment doesn't exist", async () => {});
    it("should remove the commitment after execution", async () => {});
    it("should emit an event for commitment removal", async () => {});
    it("should allow anyone to execute a commitment", async () => {});
    it("should adjust the live pair balances", async () => {});
    it("should adjust the shadow balances", async () => {});
  });
  describe("Multiple commitments", () => {
    it("should emit an event for the total changes to the pair balances", async () => {});
    it("should execute the commitments in the order they are given", async () => {});
    it("should reduce the balances of the shadows pools involved", async () => {});
  });
});
