import { ethers } from "hardhat"
import { BigNumberish, ContractReceipt, Event } from "ethers"
import { BytesLike, Result } from "ethers/lib/utils"
import { MARKET } from "./constants"
import {
    ERC20,
    LeveragedPool,
    TestPoolFactory__factory,
    TestOracleWrapper__factory,
    TestToken,
    TestToken__factory,
    PoolSwapLibrary,
    PoolSwapLibrary__factory,
    LeveragedPool__factory,
    TestChainlinkOracle__factory,
    PoolKeeper,
    PoolKeeper__factory,
} from "../typechain"

import { abi as ERC20Abi } from "../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

/**
 * Generates a random ethereum address
 * @returns A valid ethereum address, generated randomly
 */
export const generateRandomAddress = () => {
    return ethers.utils.getAddress(
        ethers.utils.hexlify(ethers.utils.randomBytes(20))
    )
}

/**
 * Generates a random integer between min and max, inclusive.
 * @param min The minimum value
 * @param max The maximum value
 * @returns Number The random integer
 */
export const getRandomInt = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min) + min)

/**
 * Extracts the arguments from the first event to match eventType.
 * @param txReceipt the transaction receipt to process for events
 * @param eventType the event name to select
 * @returns Result the arguments
 */
export const getEventArgs = (
    txReceipt: ContractReceipt | undefined,
    eventType: string | undefined
): Result | undefined => {
    return txReceipt?.events?.find((el: Event) => el.event === eventType)?.args
}

/**
 * Deploys a new instance of a pool, as well as an ERC20 token to use as a quote token.
 * @param POOL_CODE The pool identifier
 * @param firstPrice The initial value to set the lastPrice variable to in the contract
 * @param updateInterval The update interval value
 * @param frontRunningInterval The front running interval value. Must be less than the update interval
 * @param fee The fund movement fee.
 * @param leverage The amount of leverage the pool will apply
 * @param feeAddress The address to transfer fees to on a fund movement
 * @param amountMinted The amount of test quote tokens to mint
 * @returns {signers, token, pool, library, shortToken, longToken} An object containing an array of ethers signers, a Contract instance for the token, and a Contract instance for the pool.
 */
export const deployPoolAndTokenContracts = async (
    POOL_CODE: string,
    frontRunningInterval: number,
    updateInterval: number,
    fee: BytesLike,
    leverage: number,
    feeAddress: string,
    amountMinted: BigNumberish
): Promise<{
    signers: SignerWithAddress[]
    pool: LeveragedPool
    token: TestToken
    shortToken: ERC20
    longToken: ERC20
    library: PoolSwapLibrary
}> => {
    const signers = await ethers.getSigners()
    // Deploy test ERC20 token
    const testToken = (await ethers.getContractFactory(
        "TestToken",
        signers[0]
    )) as TestToken__factory
    const token = await testToken.deploy("TEST TOKEN", "TST1")
    await token.deployed()
    await token.mint(amountMinted, signers[0].address)

    // Deploy tokens
    const poolTokenFactory = (await ethers.getContractFactory(
        "TestToken",
        signers[0]
    )) as TestToken__factory
    const short = await poolTokenFactory.deploy("Short token", "SHORT")
    await short.deployed()

    const long = await poolTokenFactory.deploy("Long", "Long")
    await long.deployed()

    const chainlinkOracleFactory = (await ethers.getContractFactory(
        "TestChainlinkOracle",
        signers[0]
    )) as TestChainlinkOracle__factory
    const chainlinkOracle = await chainlinkOracleFactory.deploy()

    // Deploy tokens
    const oracleWrapperFactory = (await ethers.getContractFactory(
        "TestOracleWrapper",
        signers[0]
    )) as TestOracleWrapper__factory

    const oracleWrapper = await oracleWrapperFactory.deploy(
        chainlinkOracle.address
    )

    // Deploy and initialise pool
    const libraryFactory = (await ethers.getContractFactory(
        "PoolSwapLibrary",
        signers[0]
    )) as PoolSwapLibrary__factory
    const library = await libraryFactory.deploy()
    await library.deployed()

    const leveragedPoolFactory = (await ethers.getContractFactory(
        "LeveragedPool",
        { signer: signers[0], libraries: { PoolSwapLibrary: library.address } }
    )) as LeveragedPool__factory
    const pool = await leveragedPoolFactory.deploy()
    await pool.deployed()
    const poolReceipt = await (
        await pool.initialize(
            signers[0].address,
            oracleWrapper.address,
            long.address,
            short.address,
            POOL_CODE,
            frontRunningInterval,
            updateInterval,
            fee,
            leverage,
            feeAddress,
            token.address,
            feeAddress //todo change to a proper MARGIN/ETH oracle
        )
    ).wait()

    return {
        signers,
        pool,
        token,
        library,
        shortToken: new ethers.Contract(
            getEventArgs(poolReceipt, "PoolInitialized")?.shortToken,
            ERC20Abi,
            signers[0]
        ) as ERC20,
        longToken: new ethers.Contract(
            getEventArgs(poolReceipt, "PoolInitialized")?.longToken,
            ERC20Abi,
            signers[0]
        ) as ERC20,
    }
}

export interface CommitEventArgs {
    commitID: BigNumberish
    amount: BigNumberish
    commitType: BigNumberish
}
/**
 * Creates a commit and returns the event arguments for it
 * @param pool The pool contract instance
 * @param commitType The type of commit
 * @param amount The amount to commit to
 */
export const createCommit = async (
    pool: LeveragedPool,
    commitType: BigNumberish,
    amount: BigNumberish
): Promise<CommitEventArgs> => {
    const receipt = await (await pool.commit(commitType, amount)).wait()
    return {
        commitID: getEventArgs(receipt, "CreateCommit")?.commitID,
        amount: getEventArgs(receipt, "CreateCommit")?.amount,
        commitType: getEventArgs(receipt, "CreateCommit")?.commitType,
    }
}

/**
 * Delays execution of a function by the amount specified
 * @param milliseconds the number of milliseconds to wait
 * @returns nothing
 */
export const timeout = async (milliseconds: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function callData(
    poolKeeper: PoolKeeper,
    poolNumbers: number[]
): BytesLike {
    return ethers.utils.defaultAbiCoder.encode(
        [
            ethers.utils.ParamType.from("uint32"),
            ethers.utils.ParamType.from("string"),
            ethers.utils.ParamType.from("address[]"),
        ],
        [2, MARKET, poolNumbers.map((x) => poolKeeper.pools(x))]
    )
}
