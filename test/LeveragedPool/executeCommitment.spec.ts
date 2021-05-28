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
  createCommit,
  CommitEventArgs,
} from "../utilities";

import { BigNumberish, ContractReceipt } from "ethers";

chai.use(chaiAsPromised);
const { expect } = chai;

const amountCommitted = getRandomInt(2000, 1);
const amountMinted = getRandomInt(50000, 10000);
const feeAddress = generateRandomAddress();
const lastPrice = getRandomInt(99999999, 1);
const updateInterval = 120; // 2 minutes
const frontRunningInterval = 6; // seconds
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
    it("should revert if the commitment is too new", async () => {
      await token.approve(pool.address, amountCommitted);
      const commit = await createCommit(pool, [0], imbalance, amountCommitted);
      await expect(
        pool.executeCommitment([commit.commitID])
      ).to.be.rejectedWith(Error);
    });
    it("should revert if the max imbalance is less than the current imbalance of the pairs", async () => {
      await token.approve(pool.address, amountCommitted);
      const commit = await createCommit(pool, [0], imbalance, amountCommitted);
      await pool.executeCommitment([commit.commitID]);
      const commit2 = await createCommit(pool, [0], 1, amountCommitted);
      await expect(
        pool.executeCommitment([commit2.commitID])
      ).to.be.rejectedWith(Error);
    });
    it("should revert if the commitment doesn't exist", async () => {
      await expect(pool.executeCommitment([9])).to.be.rejectedWith(Error);
    });
  });

  describe("Single commitment", () => {
    let commit: CommitEventArgs;
    before(async () => {
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
      await token.approve(pool.address, amountCommitted);
      commit = await createCommit(pool, commitType, imbalance, amountCommitted);
    });

    it("should remove the commitment after execution", async () => {
      expect((await pool.commits(commit.commitID)).amount).to.eq(
        amountCommitted
      );
      await pool.executeCommitment([commit.commitID]);
      expect((await pool.commits(commit.commitID)).amount).to.eq(0);
    });
    it("should emit an event for commitment removal", async () => {
      const receipt = await (
        await pool.executeCommitment([commit.commitID])
      ).wait();
      expect(getEventArgs(receipt, "ExecuteCommit")?.commitID).to.eq(
        commit.commitID
      );
    });
    it("should allow anyone to execute a commitment", async () => {
      expect((await pool.commits(commit.commitID)).amount).to.eq(0);
      await pool.connect(signers[1]).executeCommitment([commit.commitID]);
      expect((await pool.commits(commit.commitID)).amount).to.eq(0);
    });
  });
  describe("Multiple commitments", () => {
    let commits: CommitEventArgs[];
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

      await token.approve(pool.address, amountCommitted);
      commits.push(await createCommit(pool, [0], 50, amountCommitted));
      await shortToken.approve(pool.address, Math.floor(amountCommitted / 2));
      commits.push(
        await createCommit(pool, [1], 50, Math.floor(amountCommitted / 2))
      );
    });
    it("should emit an event for the total changes to the pair balances", async () => {
      const receipt = await (
        await pool.executeCommitment([commits[0].commitID, commits[1].commitID])
      ).wait();
      expect(
        getEventArgs(receipt, "ExecutionResults")?.longBalanceChange
      )?.to.eq(0);
      expect(
        getEventArgs(receipt, "ExecutionResults")?.shortBalanceChange
      ).to.eq(Math.floor(amountCommitted / 2));
    });
    it("should reduce the balances of the shadows pools involved", async () => {
      // Short mint and burn pools
      expect(await pool.shadowPools(commits[0].commitType)).to.eq(
        amountCommitted
      );
      expect(await pool.shadowPools(commits[1].commitType)).to.eq(
        Math.floor(amountCommitted / 2)
      );

      await pool.executeCommitment([commits[0].commitID, commits[1].commitID]);

      expect(await pool.shadowPools(commits[0].commitType)).to.eq(0);
      expect(await pool.shadowPools(commits[1].commitType)).to.eq(0);
    });
    it("should adjust the balances of the live pools involved", async () => {
      expect(await pool.shortBalance()).to.eq(0);
      await pool.executeCommitment([commits[0].commitID, commits[1].commitID]);
      expect(await pool.shortBalance()).to.eq(Math.floor(amountCommitted / 2));
    });
  });
  describe("Commitment types", () => {
    describe("Short Mint", () => {
      before(async () => {
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
      it("should adjust the live short pool balance", async () => {
        throw new Error();
      });
      it("should reduce the shadow short mint pool balance", async () => {
        throw new Error();
      });
      it("should mint short pair tokens", async () => {
        throw new Error();
      });
    });
    describe("Short Burn", () => {
      before(async () => {
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
      it("should adjust the live short pool balance", async () => {
        throw new Error();
      });
      it("should reduce the shadow short burn pool balance", async () => {
        throw new Error();
      });
      it("should burn short pair tokens", async () => {
        throw new Error();
      });
      it("should transfer quote tokens to the commit owner", async () => {
        throw new Error();
      });
    });
    describe("Long Mint", () => {
      before(async () => {
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
      it("should adjust the live long pool balance", async () => {
        throw new Error();
      });
      it("should reduce the shadow long mint pool balance", async () => {
        throw new Error();
      });
      it("should mint long pair tokens", async () => {
        throw new Error();
      });
    });
    describe("Long Burn", () => {
      before(async () => {
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
      it("should adjust the live long pool balance", async () => {
        throw new Error();
      });
      it("should reduce the shadow long burn pool balance", async () => {
        throw new Error();
      });
      it("should burn long pair tokens", async () => {
        throw new Error();
      });
      it("should transfer quote tokens to the commit owner", async () => {
        throw new Error();
      });
    });
  });
});
