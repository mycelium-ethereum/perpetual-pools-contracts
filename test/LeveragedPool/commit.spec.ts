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
  generateRandomAddress,
  getRandomInt,
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
const commitType = [0]; // Short mint

describe("LeveragedPool - commit", () => {
  let pool: LeveragedPool;
  let signers: SignerWithAddress[];
  let token: TestToken;
  let library: PoolSwapLibrary;
  let shortToken: ERC20;
  let longToken: ERC20;
  describe("Create commit", () => {
    let receipt: ContractReceipt;
    before(async () => {
      const result = await deployPoolAndTokenContracts(
        POOL_CODE,
        frontRunningInterval,
        updateInterval,
        fee,
        leverage,
        feeAddress,
        amountMinted
      );
      signers = result.signers;
      pool = result.pool;
      token = result.token;
      library = result.library;
      await token.approve(pool.address, amountCommitted);
      receipt = await (
        await pool.commit(commitType, amountCommitted)
      ).wait();
    });
    it("should create a commit entry", async () => {
      expect(
        (await pool.commits(getEventArgs(receipt, "CreateCommit")?.commitID))
          .created
      ).to.not.eq(0);
    });
    it("should increment the id counter", async () => {
      expect((await pool.commitIDCounter()).eq(ethers.BigNumber.from(1))).to.eq(
        true
      );
    });
    it("should set the amount committed", async () => {
      expect(
        (await pool.commits(getEventArgs(receipt, "CreateCommit")?.commitID))
          .amount
      ).to.eq(amountCommitted);
    });
    it("should allocate a unique ID for each request", async () => {
      await token.approve(pool.address, amountCommitted);
      const secondCommit = await (
        await pool.commit(commitType, amountCommitted)
      ).wait();
      expect(getEventArgs(receipt, "CreateCommit")?.commitID).to.not.eq(
        getEventArgs(secondCommit, "CreateCommit")?.commitID
      );
    });

    it("should set a timestamp for each commit", async () => {
      expect(
        (await pool.commits(getEventArgs(receipt, "CreateCommit")?.commitID))
          .created
      ).to.not.eq(0);
    });

    it("should set the commit's owner", async () => {
      expect(
        (await pool.commits(getEventArgs(receipt, "CreateCommit")?.commitID))
          .owner
      ).to.eq(signers[0].address);
    });

    it("should set the commit type", async () => {
      expect(
        (await pool.commits(getEventArgs(receipt, "CreateCommit")?.commitID))
          .commitType
      ).to.eq(commitType[0]);
    });

    it("should emit an event with details of the commit", async () => {
      expect(getEventArgs(receipt, "CreateCommit")?.commitType).to.eq(
        commitType[0]
      );
      expect(getEventArgs(receipt, "CreateCommit")?.amount).to.eq(
        amountCommitted
      );
      expect(
        getEventArgs(receipt, "CreateCommit")?.commitID.gt(
          ethers.BigNumber.from(0)
        )
      ).to.eq(true);
    });
  });

  describe("Shadow balances", () => {
    beforeEach(async () => {
      const result = await deployPoolAndTokenContracts(
        POOL_CODE,
        frontRunningInterval,
        updateInterval,
        fee,
        leverage,
        feeAddress,
        amountMinted
      );
      signers = result.signers;
      pool = result.pool;
      token = result.token;
      library = result.library;
      await token.approve(pool.address, amountMinted);
    });
    it("should update the shadow short mint balance for short mint commits", async () => {
      expect(await pool.shadowPools([0])).to.eq(0);
      await pool.commit([0], amountCommitted);
      expect(await pool.shadowPools([0])).to.eq(amountCommitted);
    });

    it("should update the shadow short burn balance for short burn commits", async () => {
      const receipt = await (
        await pool.commit([0], amountCommitted)
      ).wait();
      await timeout(2000);
      await pool.executePriceChange(1, 2);
      await pool.executeCommitment([
        getEventArgs(receipt, "CreateCommit")?.commitID,
      ]);

      expect(await pool.shadowPools([1])).to.eq(0);
      await pool.commit([1], amountCommitted);
      expect((await pool.shadowPools([1])).toHexString()).to.eq(
        amountCommitted.toHexString()
      );
    });

    it("should update the shadow long mint balance for long mint commits", async () => {
      expect(await pool.shadowPools([2])).to.eq(0);
      await pool.commit([2], amountCommitted);

      expect(await pool.shadowPools([2])).to.eq(amountCommitted);
    });

    it("should update the shadow long burn balance for long burn commits", async () => {
      const receipt = await (
        await pool.commit([2], amountCommitted)
      ).wait();
      await timeout(2000);
      await pool.executePriceChange(1, 2);
      await pool.executeCommitment([
        getEventArgs(receipt, "CreateCommit")?.commitID,
      ]);

      expect(await pool.shadowPools([2])).to.eq(0);
      await pool.commit([3], amountCommitted);
      expect((await pool.shadowPools([3])).toHexString()).to.eq(
        amountCommitted.toHexString()
      );
    });
  });
  describe("Token Transfers", () => {
    beforeEach(async () => {
      const result = await deployPoolAndTokenContracts(
        POOL_CODE,
        frontRunningInterval,
        updateInterval,
        fee,
        leverage,
        feeAddress,
        amountMinted
      );
      signers = result.signers;
      pool = result.pool;
      token = result.token;
      library = result.library;
      shortToken = result.shortToken;
      longToken = result.longToken;

      await token.approve(pool.address, amountCommitted);
    });
    it("should not require a quote token transfer for short burn commits", async () => {
      const receipt = await (
        await pool.commit([0], amountCommitted)
      ).wait();
      await timeout(2000);
      await pool.executePriceChange(1, 2);
      await pool.executeCommitment([
        getEventArgs(receipt, "CreateCommit")?.commitID,
      ]);

      expect((await token.balanceOf(pool.address)).toHexString()).to.eq(
        amountCommitted.toHexString()
      );
      await pool.commit([1], amountCommitted);

      expect((await token.balanceOf(pool.address)).toHexString()).to.eq(
        amountCommitted.toHexString()
      );
    });
    it("should not require a quote token transfer for long burn commits", async () => {
      const receipt = await (
        await pool.commit([2], amountCommitted)
      ).wait();
      await timeout(2000);
      await pool.executePriceChange(1, 2);
      await pool.executeCommitment([
        getEventArgs(receipt, "CreateCommit")?.commitID,
      ]);
      expect((await token.balanceOf(pool.address)).toHexString()).to.eq(
        amountCommitted.toHexString()
      );
      await pool.commit([3], amountCommitted);
      expect((await token.balanceOf(pool.address)).toHexString()).to.eq(
        amountCommitted.toHexString()
      );
    });
    it("should burn the user's short pair tokens for short burn commits", async () => {
      // Acquire pool tokens
      const receipt = await (
        await pool.commit([0], amountCommitted)
      ).wait();
      await timeout(2000);
      await pool.executePriceChange(1, 2);
      await pool.executeCommitment([
        getEventArgs(receipt, "CreateCommit")?.commitID,
      ]);

      expect(
        (await shortToken.balanceOf(signers[0].address)).toHexString()
      ).to.eq(amountCommitted.toHexString());
      await pool.commit([1], amountCommitted);
      expect(await shortToken.balanceOf(signers[0].address)).to.eq(0);
    });
    it("should burn the user's long pair tokens for long burn commits", async () => {
      // Acquire pool tokens
      const receipt = await (
        await pool.commit([2], amountCommitted)
      ).wait();
      await timeout(2000);
      await pool.executePriceChange(1, 2);
      await pool.executeCommitment([
        getEventArgs(receipt, "CreateCommit")?.commitID,
      ]);

      expect(
        (await longToken.balanceOf(signers[0].address)).toHexString()
      ).to.eq(amountCommitted.toHexString());
      await pool.commit([3], amountCommitted);
      expect(await longToken.balanceOf(signers[0].address)).to.eq(0);
    });
    it("should transfer the user's quote tokens into the pool for long mint commits", async () => {
      expect(await token.balanceOf(pool.address)).to.eq(0);
      await pool.commit([2], amountCommitted);
      expect(await token.balanceOf(pool.address)).to.eq(amountCommitted);
    });

    it("should transfer the user's quote tokens into the pool for short mint commits", async () => {
      expect(await token.balanceOf(pool.address)).to.eq(0);
      await pool.commit([0], amountCommitted);
      expect(await token.balanceOf(pool.address)).to.eq(amountCommitted);
    });
  });
});
