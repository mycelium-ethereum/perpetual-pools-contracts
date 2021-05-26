import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { LeveragedPool, TestToken } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { POOL_CODE } from "../constants";
import {
  getEventArgs,
  amountCommitted,
  amountMinted,
  feeAddress,
  lastPrice,
  updateInterval,
  frontRunningInterval,
  fee,
  leverage,
  imbalance,
  commitType,
  deployPoolAndTokenContracts,
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

describe("LeveragedPool - uncommit", () => {
  let signers: SignerWithAddress[];
  let pool: LeveragedPool;
  let token: TestToken;
  describe("Delete commit", () => {
    let receipt: ContractReceipt;
    let commitID: string;
    beforeEach(async () => {
      const elements = await deployPoolAndTokenContracts(
        POOL_CODE,
        lastPrice,
        updateInterval,
        frontRunningInterval,
        fee,
        leverage,
        feeAddress
      );
      signers = elements.signers;
      pool = elements.pool;
      token = elements.token;
      await token.approve(pool.address, amountCommitted);
      receipt = await (
        await pool.commit(commitType, imbalance, amountCommitted)
      ).wait();
      commitID = getEventArgs(receipt, "CreateCommit")?.commitID;
    });
    it("should allow the owner of a commit delete that commit", async () => {});
    it("should remove the commit from storage", async () => {
      await pool.uncommit(commitID);
      expect((await pool.commits(commitID)).owner).to.eq(0);
      expect((await pool.commits(commitID)).created).to.eq(0);
      expect((await pool.commits(commitID)).amount).to.eq(0);
      expect((await pool.commits(commitID)).maxImbalance).to.eq(0);
      expect((await pool.commits(commitID)).commitType).to.eq(0);
    });
    it("should emit an event for uncommitting", async () => {
      const uncommitReceipt = await (await pool.uncommit(commitID)).wait();
      expect();
    });
    it("should refund the user's committed tokens", async () => {});
    it("should revert if the commit doesn't exist", async () => {});
    it("should revert if an account other than the owner tries to uncommit a commitment", async () => {});
  });
  describe("Shadow pools", () => {
    it("should update the shadow short mint balance", async () => {});
    it("should update the shadow short burn balance", async () => {});
    it("should update the shadow long mint balance", async () => {});
    it("should update the shadow long burn balance", async () => {});
  });
});
