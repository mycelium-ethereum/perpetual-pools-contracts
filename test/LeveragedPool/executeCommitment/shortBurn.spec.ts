import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  LeveragedPool,
  TestToken,
  ERC20,
  PoolSwapLibrary,
} from "../../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { POOL_CODE } from "../../constants";
import {
  deployPoolAndTokenContracts,
  getRandomInt,
  generateRandomAddress,
  createCommit,
  CommitEventArgs,
  timeout,
} from "../../utilities";
import { BytesLike } from "ethers";

chai.use(chaiAsPromised);
const { expect } = chai;

const amountCommitted = ethers.utils.parseEther("2000");
const amountMinted = ethers.utils.parseEther("10000");
const feeAddress = generateRandomAddress();
const lastPrice = getRandomInt(99999999, 1);
const updateInterval = 120; // 2 minutes
const frontRunningInterval = 1; // seconds
const fee = getRandomInt(256, 1);
const leverage = 2;
let imbalance: BytesLike;

describe("LeveragedPool - executeCommitment: Short Burn", () => {
  let token: TestToken;
  let shortToken: ERC20;
  let library: PoolSwapLibrary;
  let pool: LeveragedPool;
  let signers: SignerWithAddress[];
  let commit: CommitEventArgs;

  describe("Short Burn", () => {
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
      library = result.library;
      imbalance = await library.getRatio(
        ethers.utils.parseEther("10"),
        ethers.utils.parseEther("5")
      );
      await token.approve(pool.address, amountMinted);
      commit = await createCommit(pool, [0], imbalance, amountCommitted);
      await timeout(2000);
      await pool.executePriceChange(9);
      await pool.executeCommitment([commit.commitID]);

      await shortToken.approve(pool.address, amountCommitted);
      commit = await createCommit(pool, [1], imbalance, amountCommitted);
    });
    it("should reduce the live short pool balance", async () => {
      expect(await pool.shortBalance()).to.eq(amountCommitted);
      await timeout(2000);
      await pool.executePriceChange(9);
      await pool.executeCommitment([commit.commitID]);
      expect(await pool.shortBalance()).to.eq(0);
    });
    it("should reduce the shadow short burn pool balance", async () => {
      expect(await pool.shadowPools(commit.commitType)).to.eq(amountCommitted);
      await timeout(2000);
      await pool.executePriceChange(9);
      await pool.executeCommitment([commit.commitID]);
      expect(await pool.shadowPools(commit.commitType)).to.eq(0);
    });
    it("should transfer quote tokens to the commit owner", async () => {
      expect(await token.balanceOf(signers[0].address)).to.eq(
        amountMinted.sub(amountCommitted)
      );
      await timeout(2000);
      await pool.executePriceChange(9);
      await pool.executeCommitment([commit.commitID]);
      expect(await token.balanceOf(signers[0].address)).to.eq(amountMinted);
    });
  });
});
