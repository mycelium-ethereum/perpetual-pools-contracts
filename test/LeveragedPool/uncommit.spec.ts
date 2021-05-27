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
        feeAddress,
        amountMinted
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
    it("should allow the owner of a commit delete that commit", async () => {
      expect(
        (await pool.commits(commitID)).amount.eq(
          ethers.BigNumber.from(amountCommitted)
        )
      ).to.eq(true);
      await pool.uncommit(commitID);
      expect(
        (await pool.commits(commitID)).amount.eq(ethers.BigNumber.from(0))
      ).to.eq(true);
    });
    it("should remove the commit from storage", async () => {
      await pool.uncommit(commitID);
      expect((await pool.commits(commitID)).owner).to.eq(
        ethers.constants.AddressZero
      );
      expect((await pool.commits(commitID)).created).to.eq(0);
      expect((await pool.commits(commitID)).amount).to.eq(0);
      expect((await pool.commits(commitID)).maxImbalance).to.eq(0);
      expect((await pool.commits(commitID)).commitType).to.eq(0);
    });
    it("should emit an event for uncommitting", async () => {
      const uncommitReceipt = await (await pool.uncommit(commitID)).wait();
      expect(getEventArgs(uncommitReceipt, "RemoveCommit")?.commitID).to.eq(
        commitID
      );
      expect(getEventArgs(uncommitReceipt, "RemoveCommit")?.amount).to.eq(
        getEventArgs(receipt, "CreateCommit")?.amount
      );
      expect(getEventArgs(uncommitReceipt, "RemoveCommit")?.commitType).to.eq(
        getEventArgs(receipt, "CreateCommit")?.commitType
      );
    });
    it("should refund the user's committed tokens", async () => {
      expect(await token.balanceOf(signers[0].address)).to.eq(
        amountMinted - amountCommitted
      );
      expect(await token.balanceOf(pool.address)).to.eq(amountCommitted);

      await pool.uncommit(commitID);

      expect(await token.balanceOf(signers[0].address)).to.eq(amountMinted);
      expect(await token.balanceOf(pool.address)).to.eq(0);
    });
    it("should revert if the commit doesn't exist", async () => {
      await expect(pool.uncommit(getRandomInt(10, 100))).to.be.rejectedWith(
        Error
      );
    });
    it("should revert if an account other than the owner tries to uncommit a commitment", async () => {
      await expect(
        pool.connect(signers[1]).uncommit(commitID)
      ).to.be.rejectedWith(Error);
    });
  });
  describe("Shadow pools", () => {
    beforeEach(async () => {
      const elements = await deployPoolAndTokenContracts(
        POOL_CODE,
        lastPrice,
        updateInterval,
        frontRunningInterval,
        fee,
        leverage,
        feeAddress,
        amountMinted
      );
      signers = elements.signers;
      pool = elements.pool;
      token = elements.token;
      await token.approve(pool.address, amountCommitted);
    });
    it("should update the shadow short mint balance", async () => {
      const receipt = await (
        await pool.commit([0], imbalance, amountCommitted)
      ).wait();

      expect(
        (await pool.shadowPools(0)).eq(ethers.BigNumber.from(amountCommitted))
      ).to.eq(true);
      await pool.uncommit(getEventArgs(receipt, "CreateCommit")?.commitID);
      expect((await pool.shadowPools(0)).eq(ethers.BigNumber.from(0))).to.eq(
        true
      );
    });
    it("should update the shadow short burn balance", async () => {
      const receipt = await (
        await pool.commit([1], imbalance, amountCommitted)
      ).wait();

      expect(
        (await pool.shadowPools(1)).eq(ethers.BigNumber.from(amountCommitted))
      ).to.eq(true);
      await pool.uncommit(getEventArgs(receipt, "CreateCommit")?.commitID);
      expect((await pool.shadowPools(1)).eq(ethers.BigNumber.from(0))).to.eq(
        true
      );
    });
    it("should update the shadow long mint balance", async () => {
      const receipt = await (
        await pool.commit([2], imbalance, amountCommitted)
      ).wait();
      expect(
        (await pool.shadowPools(2)).eq(ethers.BigNumber.from(amountCommitted))
      ).to.eq(true);
      await pool.uncommit(getEventArgs(receipt, "CreateCommit")?.commitID);
      expect((await pool.shadowPools(2)).eq(ethers.BigNumber.from(0))).to.eq(
        true
      );
    });
    it("should update the shadow long burn balance", async () => {
      const receipt = await (
        await pool.commit([3], imbalance, amountCommitted)
      ).wait();
      expect(
        (await pool.shadowPools(3)).eq(ethers.BigNumber.from(amountCommitted))
      ).to.eq(true);
      await pool.uncommit(getEventArgs(receipt, "CreateCommit")?.commitID);
      expect((await pool.shadowPools(3)).eq(ethers.BigNumber.from(0))).to.eq(
        true
      );
    });
  });
});
