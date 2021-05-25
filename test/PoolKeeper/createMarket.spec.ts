import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  PoolKeeper__factory,
  PoolKeeper,
  OracleWrapper__factory,
  OracleWrapper,
} from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  MARKET,
  ORACLE,
  OPERATOR_ROLE,
  MARKET_2,
  ORACLE_2,
  ADMIN_ROLE,
} from "../constants";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("PoolKeeper - createMarket", () => {
  let poolKeeper: PoolKeeper;
  let oracleWrapper: OracleWrapper;
  let signers: SignerWithAddress[];
  beforeEach(async () => {
    // Deploy the contracts
    signers = await ethers.getSigners();

    const oracleWrapperFactory = (await ethers.getContractFactory(
      "OracleWrapper",
      signers[0]
    )) as OracleWrapper__factory;
    oracleWrapper = await oracleWrapperFactory.deploy();
    await oracleWrapper.deployed();

    const poolKeeperFactory = (await ethers.getContractFactory(
      "PoolKeeper",
      signers[0]
    )) as PoolKeeper__factory;
    poolKeeper = await poolKeeperFactory.deploy(oracleWrapper.address);
    await poolKeeper.deployed();

    await oracleWrapper.grantRole(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
      poolKeeper.address
    );

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
    expect(
      await oracleWrapper.hasRole(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(ADMIN_ROLE)),
        signers[0].address
      )
    ).to.eq(true);
  });

  it("should create a new market with the given oracle", async () => {
    expect(await oracleWrapper.assetOracles(MARKET)).to.eq(
      ethers.constants.AddressZero
    );
    await poolKeeper.createMarket(MARKET, ORACLE);
    expect(await oracleWrapper.assetOracles(MARKET)).to.eq(ORACLE);
  });

  it("should revert if the market already exists", async () => {
    expect(await oracleWrapper.assetOracles(MARKET)).to.eq(
      ethers.constants.AddressZero
    );
    await poolKeeper.createMarket(MARKET, ORACLE);
    expect(await oracleWrapper.assetOracles(MARKET)).to.eq(ORACLE);
    await expect(poolKeeper.createMarket(MARKET, ORACLE_2)).to.be.rejectedWith(
      Error
    );
  });
  it("should allow multiple markets to exist", async () => {
    expect(await oracleWrapper.assetOracles(MARKET)).to.eq(
      ethers.constants.AddressZero
    );
    await poolKeeper.createMarket(MARKET, ORACLE);
    await poolKeeper.createMarket(MARKET_2, ORACLE_2);

    expect(await oracleWrapper.assetOracles(MARKET)).to.eq(ORACLE);
    expect(await oracleWrapper.assetOracles(MARKET_2)).to.eq(ORACLE_2);
  });
  it("should emit an event containing the details of the new market", async () => {
    const receipt = await (
      await poolKeeper.createMarket(MARKET, ORACLE)
    ).wait();
    const event = receipt?.events?.find((el) => el.event === "CreateMarket");
    expect(!!event).to.eq(true);
    expect(event?.args?.marketCode).to.eq(MARKET);
    expect(event?.args?.oracle).to.eq(ORACLE);
  });
});
