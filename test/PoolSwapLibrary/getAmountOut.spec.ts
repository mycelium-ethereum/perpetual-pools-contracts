import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { PoolSwapLibrary, PoolSwapLibrary__factory } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("PoolSwapLibrary - getAmountOut", () => {
  let signers: SignerWithAddress[];
  let library: PoolSwapLibrary;
  beforeEach(async () => {
    // Deploy the contracts
    signers = await ethers.getSigners();

    const libraryFactory = (await ethers.getContractFactory(
      "PoolSwapLibrary",
      signers[0]
    )) as PoolSwapLibrary__factory;

    library = await libraryFactory.deploy();
    await library.deployed();
  });

  it("should return amountIn if the ratio is zero", async () => {
    expect(
      await library.getAmountOut(
        new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        5
      )
    ).to.eq(5);
  });
  it("should revert if the amountIn is zero", async () => {
    await expect(
      library.getAmountOut(
        new Uint8Array([5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        0
      )
    ).to.rejectedWith(Error);
  });
  it("should return the correct amount for a ratio < 1", async () => {
    // 1. ratio: 0.001 * 10 ether = 0.01 ether
    const ratio = await library.getRatio(
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("100")
    );

    expect(
      (
        await library.getAmountOut(ratio, ethers.utils.parseEther("10"))
      ).toString()
    ).to.eq(
      ethers.utils
        .parseEther("0.1")
        .sub(ethers.utils.parseUnits("1", "wei"))
        .toString()
    );
  });
  it("should return the correct amount for ratios > 1 ", async () => {
    // 2. ratio 10.5 * 10 ether = 105 ether
    let ratio = await library.getRatio(
      ethers.utils.parseEther("105"),
      ethers.utils.parseEther("10")
    );

    expect(
      (
        await library.getAmountOut(ratio, ethers.utils.parseEther("10"))
      ).toString()
    ).to.eq(ethers.utils.parseEther("105").toString());
    // 3. Ratio 25.32 * 10000 ether = 253200 ether
    ratio = await library.getRatio(
      ethers.utils.parseEther("2532"),
      ethers.utils.parseEther("100")
    );
    expect(
      (
        await library.getAmountOut(ratio, ethers.utils.parseEther("10000"))
      ).toString()
    ).to.eq(
      ethers.utils
        .parseEther("253200")
        .sub(ethers.utils.parseUnits("1", "wei"))
        .toString()
    );
  });
});
