import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { LeveragedPool } from "../../typechain";
import { POOL_CODE } from "../constants";

describe("LeveragedPool - updateFeeAddress", () => {
  let pool: LeveragedPool;
  let signers: SignerWithAddress[];
  beforeEach(async () => {
    const result = await deployPoolAndTokenContracts(
      POOL_CODE,
      5,
      "0x00000000000000000000000000000000",
      1,
      signers[0].address,
      500
    );
    signers = result.signers;
    pool = result.pool;
  });
  it("should set fee address", async () => {
    expect(await pool.feeAddress).to.eq(signers[0].address);
    await pool.updateFeeAddress(signers[1].address);
    expect(await pool.feeAddress).to.eq(signers[1].address);
  });
  it("should prevent unauthorized access", async () => {
    await pool.updateFeeAddress(signers[1].address);
    await expect(pool.updateFeeAddress(signers[2].address)).to.be.rejectedWith(
      Error
    );
  });
});
