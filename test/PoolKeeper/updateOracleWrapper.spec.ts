import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { PoolKeeper__factory, PoolKeeper } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  MARKET,
  ORACLE,
  MARKET_2,
  ORACLE_2,
  OPERATOR_ROLE,
  ADMIN_ROLE,
} from "../constants";
import { generateRandomAddress } from "../utilities";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("PoolKeeper - createMarket", () => {
  let poolKeeper: PoolKeeper;

  let signers: SignerWithAddress[];
  beforeEach(async () => {
    // Deploy the contracts
    signers = await ethers.getSigners();

    const poolKeeperFactory = (await ethers.getContractFactory(
      "PoolKeeper",
      signers[0]
    )) as PoolKeeper__factory;
    poolKeeper = await poolKeeperFactory.deploy(ethers.constants.AddressZero);
    await poolKeeper.deployed();

    // Sanity check the deployment
    expect(
      await poolKeeper.hasRole(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(ADMIN_ROLE)),
        signers[0].address
      )
    ).to.eq(true);
    expect(
      await poolKeeper.hasRole(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
        signers[0].address
      )
    ).to.eq(true);
  });

  it("should allow an authorized user to update the oracle wrapper", async () => {
    expect(await poolKeeper.oracleWrapper()).to.eq(
      ethers.constants.AddressZero
    );
    const address = generateRandomAddress();
    await poolKeeper.updateOracleWrapper(address);
    expect(await poolKeeper.oracleWrapper()).to.eq(address);
  });
  it("should prevent an unauthorized user from updating the oracle wrapper", async () => {
    expect(await poolKeeper.oracleWrapper()).to.eq(
      ethers.constants.AddressZero
    );
    const address = generateRandomAddress();
    await expect(
      poolKeeper.connect(signers[1]).updateOracleWrapper(address)
    ).to.be.rejectedWith(Error);
  });
});
