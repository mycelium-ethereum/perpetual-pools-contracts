import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  LeveragedPool,
  PoolFactory,
  PoolFactory__factory,
  PoolSwapLibrary__factory,
} from "../../typechain";

chai.use(chaiAsPromised);
const { expect } = chai;
describe("PoolFactory - Basic functions", () => {
  let factory: PoolFactory;
  before(async () => {
    const signers = await ethers.getSigners();

    const libraryFactory = (await ethers.getContractFactory(
      "PoolSwapLibrary",
      signers[0]
    )) as PoolSwapLibrary__factory;
    const library = await libraryFactory.deploy();
    await library.deployed();

    const PoolFactory = (await ethers.getContractFactory("PoolFactory", {
      signer: signers[0],
      libraries: { PoolSwapLibrary: library.address },
    })) as PoolFactory__factory;
    factory = await (await PoolFactory.deploy()).deployed();
  });

  it("should deploy a base pool contract to clone from", async () => {
    expect(await factory.poolBase()).to.not.eq(ethers.constants.AddressZero);
  });
  it("should deploy a base pair token to clone from", async () => {
    expect(await factory.pairTokenBase()).to.not.eq(
      ethers.constants.AddressZero
    );
  });
  it("should initialize the base pool", async () => {
    const pool = new ethers.Contract(await factory.poolBase(), , await ethers.getSigner())
    await expect().to.be.rejectedWith(Error);
  });
  it("should initialize the base token", async () => {
    await expect().to.be.rejectedWith(Error);
  });
});
