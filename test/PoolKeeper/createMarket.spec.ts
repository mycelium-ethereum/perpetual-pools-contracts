import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  PoolKeeper__factory,
  PoolKeeper,
  ChainlinkOracleWrapper__factory,
  ChainlinkOracleWrapper,
  PoolSwapLibrary__factory,
  PoolFactory__factory,
  ChainlinkOracle__factory,
} from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  OPERATOR_ROLE,
  ADMIN_ROLE,
} from "../constants";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("PoolKeeper - createMarket", () => {
  let poolKeeper: PoolKeeper;
  let oracleWrapper: ChainlinkOracleWrapper;
  let signers: SignerWithAddress[];
  beforeEach(async () => {
    // Deploy the contracts
    signers = await ethers.getSigners();

    const chainlinkOracleFactory = (await ethers.getContractFactory(
      "ChainlinkOracle",
      signers[0]
    )) as ChainlinkOracle__factory;
    const chainlinkOracle = await chainlinkOracleFactory.deploy();

    // Deploy tokens
    const chainlinkOracleWrapperFactory = (await ethers.getContractFactory(
      "ChainlinkOracleWrapper",
      signers[0]
    )) as ChainlinkOracleWrapper__factory;
    const oracleWrapper = await chainlinkOracleWrapperFactory.deploy(chainlinkOracle.address);
    await oracleWrapper.deployed();

    const libraryFactory = (await ethers.getContractFactory(
      "PoolSwapLibrary",
      signers[0]
    )) as PoolSwapLibrary__factory;
    const library = await libraryFactory.deploy();
    await library.deployed();
    const poolKeeperFactory = (await ethers.getContractFactory("PoolKeeper", {
      signer: signers[0],
    })) as PoolKeeper__factory;
    const PoolFactory = (await ethers.getContractFactory("PoolFactory", {
      signer: signers[0],
      libraries: { PoolSwapLibrary: library.address },
    })) as PoolFactory__factory;
    const factory = await (await PoolFactory.deploy()).deployed();
    poolKeeper = await poolKeeperFactory.deploy(
      factory.address
    );
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
      await oracleWrapper.hasRole(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(ADMIN_ROLE)),
        signers[0].address
      )
    ).to.eq(true);
  });
});
