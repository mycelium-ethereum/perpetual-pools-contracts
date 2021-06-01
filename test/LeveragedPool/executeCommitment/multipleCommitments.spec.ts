import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { LeveragedPool, TestToken, ERC20 } from "../../../typechain";

import { POOL_CODE } from "../../constants";
import {
  deployPoolAndTokenContracts,
  getRandomInt,
  generateRandomAddress,
  createCommit,
  CommitEventArgs,
  timeout,
} from "../../utilities";

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
const imbalance = ethers.BigNumber.from("5").mul(
  ethers.BigNumber.from("2").pow(64)
); // ABDK 64.64 fixed point number == 5%
const commitType = [0]; //Short mint;

describe("LeveragedPool - executeCommitment:  Multiple commitments", () => {
  let token: TestToken;
  let shortToken: ERC20;
  let pool: LeveragedPool;
  const commits: CommitEventArgs[] | undefined = [];
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

    token = result.token;
    shortToken = result.shortToken;

    await token.approve(pool.address, amountCommitted);
    commits.push(
      await createCommit(pool, commitType, imbalance, amountCommitted)
    );
    await shortToken.approve(pool.address, amountCommitted.div(2));
    commits.push(
      await createCommit(pool, [1], imbalance, amountCommitted.div(2))
    );
  });
  it("should reduce the balances of the shadows pools involved", async () => {
    // Short mint and burn pools
    expect(await pool.shadowPools(commits[0].commitType)).to.eq(
      amountCommitted
    );
    expect(await pool.shadowPools(commits[1].commitType)).to.eq(
      amountCommitted.div(2)
    );
    await timeout(2000);
    await pool.executePriceChange(9);
    await pool.executeCommitment([commits[0].commitID, commits[1].commitID]);

    expect(await pool.shadowPools(commits[0].commitType)).to.eq(0);
    expect(await pool.shadowPools(commits[1].commitType)).to.eq(0);
  });
  it("should adjust the balances of the live pools involved", async () => {
    expect(await pool.shortBalance()).to.eq(0);
    await timeout(2000);
    await pool.executePriceChange(9);
    await pool.executeCommitment([commits[0].commitID, commits[1].commitID]);
    expect(await pool.shortBalance()).to.eq(amountCommitted.div(2));
  });
});
