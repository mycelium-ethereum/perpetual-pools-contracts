import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { ethers } from "hardhat";
import { LeveragedPool } from "../../typechain";
import { POOL_CODE } from "../constants";
import { deployPoolAndTokenContracts } from "../utilities";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("LeveragedPool - updateFeeAddress", () => {
  let pool: LeveragedPool;
  let signers: SignerWithAddress[];
  beforeEach(async () => {
    signers = await ethers.getSigners();
    const result = await deployPoolAndTokenContracts(
      POOL_CODE,
      5,
      "0x00000000000000000000000000000000",
      1,
      signers[0].address,
      500
    );
    pool = result.pool;
  });
  it("should set fee address", async () => {
    expect(await pool.feeAddress()).to.eq(signers[0].address);
    await pool.updateFeeAddress(signers[1].address);
    expect(await pool.feeAddress()).to.eq(signers[1].address);
  });
  it("should prevent unauthorized access", async () => {
    await pool.updateFeeAddress(signers[1].address);
    await expect(
      pool.connect(signers[2]).updateFeeAddress(signers[2].address)
    ).to.be.rejectedWith(Error);
  });
});
