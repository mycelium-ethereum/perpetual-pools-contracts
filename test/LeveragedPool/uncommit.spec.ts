import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  ERC20,
  LeveragedPool,
  PoolSwapLibrary,
  TestToken,
} from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { POOL_CODE } from "../constants";
import {
  getEventArgs,
  deployPoolAndTokenContracts,
  getRandomInt,
  generateRandomAddress,
  timeout,
} from "../utilities";

import { BytesLike, ContractReceipt } from "ethers";

chai.use(chaiAsPromised);
const { expect } = chai;

const amountCommitted = ethers.utils.parseEther("2000");
const amountMinted = ethers.utils.parseEther("10000");
const feeAddress = generateRandomAddress();
const lastPrice = getRandomInt(99999999, 1);
const updateInterval = 2;
const frontRunningInterval = 1;
const fee = "0x00000000000000000000000000000000";
const leverage = 1;
let imbalance: BytesLike;
const commitType = [2]; // Long mint;

describe("LeveragedPool - uncommit", () => {
  let signers: SignerWithAddress[];
  let pool: LeveragedPool;
  let token: TestToken;
  let library: PoolSwapLibrary;
  describe("Delete commit", () => {
    let receipt: ContractReceipt;
    let commitID: string;
    beforeEach(async () => {
      const elements = await deployPoolAndTokenContracts(
        POOL_CODE,

        frontRunningInterval,
        fee,
        leverage,
        feeAddress,
        amountMinted
      );
      signers = elements.signers;
      pool = elements.pool;
      token = elements.token;
      library = elements.library;
      imbalance = await library.getRatio(
        ethers.utils.parseEther("10"),
        ethers.utils.parseEther("5")
      );
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
      expect(
        ethers.BigNumber.from(
          (await pool.commits(commitID)).maxImbalance
        ).toHexString()
      ).to.eq("0x00");
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
      const pairToken = await (
        await pool.commit([0], imbalance, amountCommitted)
      ).wait();
      await timeout(2000);
      await pool.executePriceChange(1, 2);
      await pool.executeCommitment([
        getEventArgs(pairToken, "CreateCommit")?.commitID,
      ]);
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
      const pairToken = await (
        await pool.commit([2], imbalance, amountCommitted)
      ).wait();
      await timeout(2000);
      await pool.executePriceChange(1, 2);
      await pool.executeCommitment([
        getEventArgs(pairToken, "CreateCommit")?.commitID,
      ]);
      const receipt = await (
        await pool.commit([3], imbalance, amountCommitted)
      ).wait();

      expect(
        (await pool.shadowPools(3)).eq(ethers.BigNumber.from(amountCommitted))
      ).to.eq(true);
      await pool.uncommit(getEventArgs(receipt, "CreateCommit")?.commitID);
      expect((await pool.shadowPools(1)).eq(ethers.BigNumber.from(0))).to.eq(
        true
      );
    });
  });
  describe("Token transfers", () => {
    let shortToken: ERC20;
    let longToken: ERC20;
    beforeEach(async () => {
      const elements = await deployPoolAndTokenContracts(
        POOL_CODE,

        frontRunningInterval,
        fee,
        leverage,
        feeAddress,
        amountMinted
      );
      signers = elements.signers;
      pool = elements.pool;
      token = elements.token;
      shortToken = elements.shortToken;
      longToken = elements.longToken;
      await token.approve(pool.address, amountCommitted);
    });
    it("should refund the user's quote tokens for long mint commits", async () => {
      const receipt = await (
        await pool.commit([0], imbalance, amountCommitted)
      ).wait();
      expect(await token.balanceOf(signers[0].address)).to.eq(
        amountMinted.sub(amountCommitted)
      );
      expect(await token.balanceOf(pool.address)).to.eq(amountCommitted);

      await pool.uncommit(getEventArgs(receipt, "CreateCommit")?.commitID);

      expect(await token.balanceOf(signers[0].address)).to.eq(amountMinted);
      expect(await token.balanceOf(pool.address)).to.eq(0);
    });
    it("should refund the user's quote tokens for short mint commits", async () => {
      const receipt = await (
        await pool.commit([2], imbalance, amountCommitted)
      ).wait();
      expect(await token.balanceOf(signers[0].address)).to.eq(
        amountMinted.sub(amountCommitted)
      );
      expect(await token.balanceOf(pool.address)).to.eq(amountCommitted);

      await pool.uncommit(getEventArgs(receipt, "CreateCommit")?.commitID);

      expect(await token.balanceOf(signers[0].address)).to.eq(amountMinted);
      expect(await token.balanceOf(pool.address)).to.eq(0);
    });
    it("should not transfer quote tokens for short burn commits", async () => {
      const pairToken = await (
        await pool.commit([0], imbalance, amountCommitted)
      ).wait();
      await timeout(2000);
      await pool.executePriceChange(1, 2);
      await pool.executeCommitment([
        getEventArgs(pairToken, "CreateCommit")?.commitID,
      ]);
      const receipt = await (
        await pool.commit([1], imbalance, amountCommitted)
      ).wait();
      expect(await token.balanceOf(signers[0].address)).to.eq(
        amountMinted.sub(amountCommitted)
      );
      expect(await token.balanceOf(pool.address)).to.eq(amountCommitted);

      await pool.uncommit(getEventArgs(receipt, "CreateCommit")?.commitID);

      expect(await token.balanceOf(signers[0].address)).to.eq(
        amountMinted.sub(amountCommitted)
      );
      expect(await token.balanceOf(pool.address)).to.eq(amountCommitted);
    });
    it("should not transfer quote tokens for long burn commits", async () => {
      const pairToken = await (
        await pool.commit([2], imbalance, amountCommitted)
      ).wait();
      await timeout(2000);
      await pool.executePriceChange(1, 2);
      await pool.executeCommitment([
        getEventArgs(pairToken, "CreateCommit")?.commitID,
      ]);
      const receipt = await (
        await pool.commit([3], imbalance, amountCommitted)
      ).wait();
      expect(await token.balanceOf(signers[0].address)).to.eq(
        amountMinted.sub(amountCommitted)
      );
      expect(await token.balanceOf(pool.address)).to.eq(amountCommitted);

      await pool.uncommit(getEventArgs(receipt, "CreateCommit")?.commitID);

      expect(await token.balanceOf(signers[0].address)).to.eq(
        amountMinted.sub(amountCommitted)
      );
      expect(await token.balanceOf(pool.address)).to.eq(amountCommitted);
    });
    it("should refund short pair tokens to the user for short burn commits", async () => {
      const pairToken = await (
        await pool.commit([0], imbalance, amountCommitted)
      ).wait();
      await timeout(2000);
      await pool.executePriceChange(1, 2);
      await pool.executeCommitment([
        getEventArgs(pairToken, "CreateCommit")?.commitID,
      ]);
      const receipt = await (
        await pool.commit([1], imbalance, amountCommitted)
      ).wait();
      expect(await shortToken.balanceOf(signers[0].address)).to.eq(0);
      await pool.uncommit(getEventArgs(receipt, "CreateCommit")?.commitID);
      expect(await shortToken.balanceOf(signers[0].address)).to.eq(
        amountCommitted
      );
    });
    it("should refund long pair tokens to the user for long burn commits", async () => {
      const pairToken = await (
        await pool.commit([2], imbalance, amountCommitted)
      ).wait();
      await timeout(2000);
      await pool.executePriceChange(1, 2);
      await pool.executeCommitment([
        getEventArgs(pairToken, "CreateCommit")?.commitID,
      ]);
      const receipt = await (
        await pool.commit([3], imbalance, amountCommitted)
      ).wait();
      expect(await longToken.balanceOf(signers[0].address)).to.eq(0);
      await pool.uncommit(getEventArgs(receipt, "CreateCommit")?.commitID);
      expect(await longToken.balanceOf(signers[0].address)).to.eq(
        amountCommitted
      );
    });
  });
});
