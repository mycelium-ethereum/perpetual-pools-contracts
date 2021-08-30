import { ethers, network, deployments } from "hardhat"
import {
    BigNumberish,
    ContractReceipt,
    ContractTransaction,
    Event,
} from "ethers"
import { BytesLike, Result } from "ethers/lib/utils"
import {
    DEFAULT_FEE,
    DEFAULT_MINT_AMOUNT,
    MARKET,
    POOL_CODE,
    POOL_CODE_2,
} from "./constants"
import {
    ERC20,
    LeveragedPool,
    ChainlinkOracleWrapper__factory,
    TestToken,
    TestToken__factory,
    PoolSwapLibrary,
    PoolSwapLibrary__factory,
    TestChainlinkOracle__factory,
    PoolKeeper,
    PoolFactory__factory,
    PoolKeeper__factory,
    PoolFactory,
    PoolCommitter,
    PoolCommitterDeployer__factory,
    TestChainlinkOracle,
    ChainlinkOracleWrapper,
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

export const deployPoolSetupContracts = deployments.createFixture(async () => {
    const amountMinted = DEFAULT_MINT_AMOUNT

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
    const chainlinkOracle = await (
        await chainlinkOracleFactory.deploy()
    ).deployed()
    const ethOracle = await (await chainlinkOracleFactory.deploy()).deployed()
    await ethOracle.setPrice(3000 * 10 ** 8)

    // Deploy tokens
    const oracleWrapperFactory = (await ethers.getContractFactory(
        "ChainlinkOracleWrapper",
        signers[0]
    )) as ChainlinkOracleWrapper__factory

    const oracleWrapper = await oracleWrapperFactory.deploy(
        chainlinkOracle.address
    )

    /* keeper oracle */
    const settlementEthOracle = await oracleWrapperFactory.deploy(
        ethOracle.address
    )

    // Deploy and initialise pool
    const libraryFactory = (await ethers.getContractFactory(
        "PoolSwapLibrary",
        signers[0]
    )) as PoolSwapLibrary__factory
    const library = await libraryFactory.deploy()
    await library.deployed()

    const PoolFactory = (await ethers.getContractFactory("PoolFactory", {
        signer: signers[0],
        libraries: { PoolSwapLibrary: library.address },
    })) as PoolFactory__factory

    const factory = await (
        await PoolFactory.deploy(generateRandomAddress())
    ).deployed()

    const poolCommitterDeployerFactory = (await ethers.getContractFactory(
        "PoolCommitterDeployer",
        {
            signer: signers[0],
            libraries: { PoolSwapLibrary: library.address },
        }
    )) as PoolCommitterDeployer__factory

    let poolCommitterDeployer = await poolCommitterDeployerFactory.deploy(
        factory.address
    )
    poolCommitterDeployer = await poolCommitterDeployer.deployed()

    await factory.setPoolCommitterDeployer(poolCommitterDeployer.address)

    const poolKeeperFactory = (await ethers.getContractFactory("PoolKeeper", {
        signer: signers[0],
        libraries: { PoolSwapLibrary: library.address },
    })) as PoolKeeper__factory
    let poolKeeper = await poolKeeperFactory.deploy(factory.address)
    poolKeeper = await poolKeeper.deployed()
    await factory.setPoolKeeper(poolKeeper.address)
    await factory.setFee(DEFAULT_FEE)

    return {
        factory,
        poolKeeper,
        chainlinkOracle,
        oracleWrapper,
        settlementEthOracle,
        token,
        library,
    }
})

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
    leverage: number,
    feeAddress?: string,
    fee?: BytesLike
): Promise<{
    signers: SignerWithAddress[]
    pool: LeveragedPool
    token: TestToken
    library: PoolSwapLibrary
    shortToken: ERC20
    longToken: ERC20
    poolCommitter: PoolCommitter
    poolKeeper: PoolKeeper
    chainlinkOracle: TestChainlinkOracle
    factory: PoolFactory
    oracleWrapper: ChainlinkOracleWrapper
    settlementEthOracle: ChainlinkOracleWrapper
}> => {
    const setupContracts = await deployPoolSetupContracts()

    // deploy the pool using the factory, not separately
    const deployParams = {
        poolName: POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: leverage,
        quoteToken: setupContracts.token.address,
        oracleWrapper: setupContracts.oracleWrapper.address,
        settlementEthOracle: setupContracts.settlementEthOracle.address,
    }

    if (fee) {
        await setupContracts.factory.setFee(fee)
    }
    if (feeAddress) {
        await setupContracts.factory.setFeeReceiver(feeAddress)
    }
    await setupContracts.factory.deployPool(deployParams)
    const poolAddress = await setupContracts.factory.pools(0)
    const pool = await ethers.getContractAt("LeveragedPool", poolAddress)

    let longTokenAddr = await pool.tokens(0)
    let shortTokenAddr = await pool.tokens(1)
    const longToken = await ethers.getContractAt(ERC20Abi, longTokenAddr)
    const shortToken = await ethers.getContractAt(ERC20Abi, shortTokenAddr)

    let commiter = await pool.poolCommitter()
    const poolCommitter = await ethers.getContractAt("PoolCommitter", commiter)

    const signers = await ethers.getSigners()

    const token = setupContracts.token
    const library = setupContracts.library
    const poolKeeper = setupContracts.poolKeeper
    const chainlinkOracle = setupContracts.chainlinkOracle
    const factory = setupContracts.factory
    const oracleWrapper = setupContracts.oracleWrapper
    const settlementEthOracle = setupContracts.settlementEthOracle

    return {
        signers,
        //@ts-ignore
        pool,
        token,
        library,
        //@ts-ignore
        shortToken,
        //@ts-ignore
        longToken,
        //@ts-ignore
        poolCommitter,
        poolKeeper,
        chainlinkOracle,
        factory,
        oracleWrapper,
        settlementEthOracle,
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
    poolCommitter: PoolCommitter,
    commitType: BigNumberish,
    amount: BigNumberish
): Promise<any> /*Promise<CommitEventArgs>*/ => {
    const receipt = await (
        await poolCommitter.commit(commitType, amount)
    ).wait()
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
    await network.provider.send("evm_increaseTime", [milliseconds / 1000])
    await network.provider.send("evm_mine", [])
}

export function callData(
    factory: PoolFactory,
    poolNumbers: number[]
): BytesLike {
    return ethers.utils.defaultAbiCoder.encode(
        [
            ethers.utils.ParamType.from("uint32"),
            ethers.utils.ParamType.from("string"),
            ethers.utils.ParamType.from("address[]"),
        ],
        [2, MARKET, poolNumbers.map((x) => factory.pools(x))]
    )
}

export async function incrementPrice(
    oracle: TestChainlinkOracle
): Promise<ContractTransaction> {
    let oldPrice = await oracle.price()
    let newPrice = oldPrice.add("100000000") // 1 * 10^18 (for default chainlink oracle decimals)
    return oracle.setPrice(newPrice)
}
