import { ethers } from "hardhat";
import { BigNumberish, Contract, ContractReceipt, Event } from "ethers";
import { BytesLike, Result } from "ethers/lib/utils";
import {
  ERC20,
  LeveragedPool,
  TestPoolFactory__factory,
  TestToken,
  TestToken__factory,
  PoolSwapLibrary,
  PoolSwapLibrary__factory,
  LeveragedPool__factory,
} from "../typechain";

import { abi as ERC20Abi } from "../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

enum Side {
    Long,
    Short,
}

interface Deployment {
  deployer: SignerWithAddress;
  pool: LeveragedPool;
  settlementToken: ERC20;
  longToken: ERC20;
  shortToken: ERC20;
  library: PoolSwapLibrary;
}

interface InitialisationArguments {
  poolTicker: string,
  frontRunningInterval: number,
  fee: BytesLike,
  leverage: number,
  feeAddress: string,
}

function poolTokenName(ticker: string, side: Side) {
    /* TODO: implement */
}

function poolTokenTicker(ticker: string, side: Side) {
    /* TODO: implement */
}

async function deployNoArgsContract(name: string, deployer: SignerWithAddress): Promise<Contract> {
    let factory = await ethers.getContractFactory(name, deployer);
    let contract: Contract = await factory.deploy();
    await contract.deployed();

    return contract;
}

async function deployPoolTokens(
    ticker: string,
    deployer: SignerWithAddress
): Promise<any> {
    /* get instance of token factory */
    let tokenFactory = await ethers.getContractFactory("TestToken", deployer);

    /* deploy LONG token */
    let longToken = await tokenFactory.deploy(
        poolTokenName(ticker, Side.Long),
        poolTokenTicker(ticker, Side.Long)
    );
    await longToken.deployed();
    
    /* deploy SHORT token */
    let shortToken = await tokenFactory.deploy();
    await shortToken.deployed();

    return [longToken, shortToken];
}

async function deployPools(
  settlementToken: ERC20,
  baseToken: ERC20,
  quoteToken: ERC20,
  deployer: SignerWithAddress,
  init: InitialisationArguments,
  amountMinted: BigNumberish
): Promise<Deployment> {
    /* deploy pool tokens */
    let [longToken, shortToken] = await deployPoolTokens(
        init.poolTicker,
        deployer
    );

    /* deploy library */
    let library: PoolSwapLibrary = (
        await deployNoArgsContract("PoolSwapLibrary", deployer)
    ) as PoolSwapLibrary;

    /* deploy leveraged pool */
    let leveragedPool: LeveragedPool = (
        await deployNoArgsContract("LeveragedPool", deployer)
    ) as LeveragedPool;

    /* initialise the leveraged pool */
    await leveragedPool.initialize(
        deployer.address,
        longToken.address,
        shortToken.address,
        init.poolTicker,
        init.frontRunningInterval,
        init.fee,
        init.leverage,
        init.feeAddress,
        settlementToken.address
    );

    /* construct deployment result type */
    let deployment: Deployment = {
        deployer: deployer,
        pool: leveragedPool,
        settlementToken: settlementToken,
        longToken: longToken,
        shortToken: shortToken,
        library: library,
    };

    return deployment;
}

async function main() {
    /* TODO: call deployPools */
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

