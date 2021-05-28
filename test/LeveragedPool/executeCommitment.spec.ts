import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { LeveragedPool, TestToken, ERC20 } from "../../typechain";
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
const updateInterval = 120;
const frontRunningInterval = 30;
const fee = getRandomInt(256, 1);
const leverage = 2;
const imbalance = 5;
const commitType = [2]; //long mint;

describe("LeveragedPool - executeCommitment", () => {
  let token: TestToken;
  let shortToken: ERC20;
  let longToken: ERC20;
  let pool: LeveragedPool;
  let signers: SignerWithAddress[];

  describe("Revert cases", () => {
    beforeEach(async () => {
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
      pool = result.pool;
      signers = result.signers;
      token = result.token;
      shortToken = result.shortToken;
      longToken = result.longToken;
    });
    it("should revert if the commitment is too new", async () => {});
    it("should revert if the max imbalance is less than the current imbalance of the pairs", async () => {});
    it("should revert if the commitment doesn't exist", async () => {});
  });
  describe("Single commitment", () => {
    before(async () => {});

    it("should remove the commitment after execution", async () => {});
    it("should emit an event for commitment removal", async () => {});
    it("should allow anyone to execute a commitment", async () => {});
  });
  describe("Multiple commitments", () => {
    before(async () => {});
    it("should emit an event for the total changes to the pair balances", async () => {});
    it("should execute the commitments in the order they are given", async () => {});
    it("should reduce the balances of the shadows pools involved", async () => {});
    it("should reduce the balances of the live pools involved", async () => {});
  });
  describe("Commitment types", () => {
    describe("Short Mint", () => {
      before(async () => {});
      it("should adjust the live short pool balance", async () => {});
      it("should reduce the shadow short mint pool balance", async () => {});
    });
    describe("Short Burn", () => {
      before(async () => {});
      it("should adjust the live short pool balance", async () => {});
      it("should reduce the shadow short burn pool balance", async () => {});
    });
    describe("Long Mint", () => {
      before(async () => {});
      it("should adjust the live long pool balance", async () => {});
      it("should reduce the shadow long mint pool balance", async () => {});
    });
    describe("Long Burn", () => {
      before(async () => {});
      it("should adjust the live long pool balance", async () => {});
      it("should reduce the shadow long burn pool balance", async () => {});
    });
  });
});
