import { ethers, network } from "hardhat"
import {
    BigNumberish,
    ContractReceipt,
    ContractTransaction,
    Event,
    Signer,
} from "ethers"
import { BytesLike, Result } from "ethers/lib/utils"
import {
    LONG_BURN,
    SHORT_BURN,
    DEFAULT_FEE,
    DEFAULT_MINT_AMOUNT,
    MARKET,
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
    TestChainlinkOracle,
    ChainlinkOracleWrapper,
    AutoClaim__factory,
    AutoClaim,
    InvariantCheck__factory,
    InvariantCheck,
    LeveragedPoolBalanceDrainMock,
    PoolFactoryBalanceDrainMock,
    PoolFactoryBalanceDrainMock__factory,
    KeeperRewards__factory,
    KeeperRewards,
    L2Encoder,
    L2Encoder__factory,
} from "../types"

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

export const getNextTotalCommit = async (poolCommitter: PoolCommitter) =>
    await poolCommitter.totalPoolCommitments(
        (await poolCommitter.updateIntervalId()).add("1")
    )

export const getCurrentTotalCommit = async (poolCommitter: PoolCommitter) =>
    await poolCommitter.totalPoolCommitments(
        await poolCommitter.updateIntervalId()
    )

export const getCurrentUserCommit = async (
    address: string,
    poolCommitter: PoolCommitter
) =>
    await poolCommitter.userCommitments(
        address,
        await poolCommitter.updateIntervalId()
    )

export const getNextUserCommit = async (
    address: string,
    poolCommitter: PoolCommitter
) =>
    await poolCommitter.userCommitments(
        address,
        (await poolCommitter.updateIntervalId()).add(1)
    )

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

export const deployPoolSetupContracts = async () => {
    const amountMinted = DEFAULT_MINT_AMOUNT
    const signers = await ethers.getSigners()

    const l2EncoderFactory = (await ethers.getContractFactory(
        "L2Encoder",
        signers[0]
    )) as L2Encoder__factory
    const l2Encoder = await l2EncoderFactory.deploy()
    await l2Encoder.deployed()

    // Deploy test ERC20 token
    const testToken = (await ethers.getContractFactory(
        "TestToken",
        signers[0]
    )) as TestToken__factory
    const token = await testToken.deploy("TEST TOKEN", "TST1")
    await token.deployed()
    await token.mint(signers[0].address, amountMinted)

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
        chainlinkOracle.address,
        signers[0].address
    )

    /* keeper oracle */
    const settlementEthOracle = await oracleWrapperFactory.deploy(
        ethOracle.address,
        signers[0].address
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
        await PoolFactory.deploy(generateRandomAddress(), signers[0].address)
    ).deployed()

    const invariantCheckFactory = (await ethers.getContractFactory(
        "InvariantCheck",
        signers[0]
    )) as InvariantCheck__factory

    const invariantCheck = await invariantCheckFactory.deploy(factory.address)
    await factory.setInvariantCheck(invariantCheck.address)

    const poolKeeperFactory = (await ethers.getContractFactory("PoolKeeper", {
        signer: signers[0],
    })) as PoolKeeper__factory
    let poolKeeper = await poolKeeperFactory.deploy(factory.address)
    poolKeeper = await poolKeeper.deployed()
    await factory.setPoolKeeper(poolKeeper.address)
    await factory.setFee(DEFAULT_FEE)

    const keeperRewardsFactory = (await ethers.getContractFactory(
        "KeeperRewards",
        {
            signer: signers[0],
            libraries: { PoolSwapLibrary: library.address },
        }
    )) as KeeperRewards__factory
    let keeperRewards = await keeperRewardsFactory.deploy(poolKeeper.address)

    await poolKeeper.setKeeperRewards(keeperRewards.address)

    const autoClaimFactory = (await ethers.getContractFactory("AutoClaim", {
        signer: signers[0],
    })) as AutoClaim__factory
    let autoClaim = await autoClaimFactory.deploy(factory.address)
    autoClaim = await autoClaim.deployed()
    await factory.setAutoClaim(autoClaim.address)

    return {
        factory,
        poolKeeper,
        chainlinkOracle,
        oracleWrapper,
        settlementEthOracle,
        invariantCheck,
        token,
        library,
        autoClaim,
        keeperRewards,
        l2Encoder,
    }
}

/**
 * Deploys a new instance of a pool, as well as an ERC20 token to use as a settlement token.
 * @param POOL_CODE The pool identifier
 * @param firstPrice The initial value to set the lastPrice variable to in the contract
 * @param updateInterval The update interval value
 * @param frontRunningInterval The front running interval value. Must be less than the update interval
 * @param fee The fund movement fee.
 * @param leverage The amount of leverage the pool will apply
 * @param feeAddress The address to transfer fees to on a fund movement
 * @param amountMinted The amount of test settlement tokens to mint
 * @returns {signers, token, pool, library, shortToken, longToken} An object containing an array of ethers signers, a Contract instance for the token, and a Contract instance for the pool.
 */
export const deployPoolAndTokenContracts = async (
    POOL_CODE: string,
    frontRunningInterval: number,
    updateInterval: number,
    leverage: number,
    feeAddress?: string,
    fee?: BigNumberish,
    mintFee?: BigNumberish,
    burnFee?: BigNumberish,
    changeInterval?: BigNumberish
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
    invariantCheck: InvariantCheck
    settlementEthOracle: ChainlinkOracleWrapper
    autoClaim: AutoClaim
    keeperRewards: KeeperRewards
    l2Encoder: L2Encoder
}> => {
    const setupContracts = await deployPoolSetupContracts()

    const signers = await ethers.getSigners()

    // deploy the pool using the factory, not separately
    const deployParams = {
        poolName: POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: leverage,
        settlementToken: setupContracts.token.address,
        oracleWrapper: setupContracts.oracleWrapper.address,
        settlementEthOracle: setupContracts.settlementEthOracle.address,
        feeController: signers[0].address,
        mintingFee: mintFee || 0,
        burningFee: burnFee || 0,
        changeInterval: changeInterval || 0,
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

    await timeout(updateInterval * 10000)
    await setupContracts.poolKeeper.performUpkeepSinglePool(pool.address)

    let longTokenAddr = await pool.tokens(0)
    let shortTokenAddr = await pool.tokens(1)
    const longToken = await ethers.getContractAt(ERC20Abi, longTokenAddr)
    const shortToken = await ethers.getContractAt(ERC20Abi, shortTokenAddr)

    let committer = await pool.poolCommitter()
    const poolCommitter = await ethers.getContractAt("PoolCommitter", committer)

    const token = setupContracts.token
    const library = setupContracts.library
    const poolKeeper = setupContracts.poolKeeper
    const chainlinkOracle = setupContracts.chainlinkOracle
    const factory = setupContracts.factory
    const oracleWrapper = setupContracts.oracleWrapper
    const settlementEthOracle = setupContracts.settlementEthOracle
    const autoClaim = setupContracts.autoClaim
    const invariantCheck = setupContracts.invariantCheck
    const keeperRewards = setupContracts.keeperRewards
    const l2Encoder = setupContracts.l2Encoder

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
        invariantCheck,
        poolKeeper,
        chainlinkOracle,
        factory,
        oracleWrapper,
        settlementEthOracle,
        autoClaim,
        keeperRewards,
        l2Encoder,
    }
}

export interface CommitEventArgs {
    commitID: BigNumberish
    amount: BigNumberish
    commitType: BigNumberish
}

/**
 * @param users array of user addresses to be autoclaimed
 * @param poolCommitters the PoolKeeper object
 * @param autoClaim
 * @param l2Encoder the L2Encoder object for encoding function parameters
 * @param signer the ethers Signer object (optional)
 */
export const autoClaimSinglePoolCommitter = async (
    users: string[],
    poolCommitter: string,
    autoClaim: AutoClaim,
    l2Encoder: L2Encoder,
    signer?: Signer
): Promise<any> /*Promise<CommitEventArgs>*/ => {
    const encodedArgs = await l2Encoder.encodeAddressArray(users)

    signer = signer ? signer : (await ethers.getSigners())[0]
    return await autoClaim
        .connect(signer)
        .multiPaidClaimSinglePoolCommitter(encodedArgs, poolCommitter)
}

/**
 * @param users array of user addresses to be autoclaimed
 * @param poolCommitters The pool committers in which to claim
 * @param autoClaim The AutoClaim contract
 * @param l2Encoder the L2Encoder object for encoding function parameters
 * @param signer the ethers Signer object (optional)
 */
export const autoClaimMultiPoolCommitters = async (
    users: string[],
    poolCommitters: string[],
    autoClaim: AutoClaim,
    l2Encoder: L2Encoder,
    signer?: Signer
): Promise<any> /*Promise<CommitEventArgs>*/ => {
    const encodedArgs0 = await l2Encoder.encodeAddressArray(users)
    const encodedArgs1 = await l2Encoder.encodeAddressArray(poolCommitters)

    signer = signer ? signer : (await ethers.getSigners())[0]
    return await autoClaim
        .connect(signer)
        .multiPaidClaimMultiplePoolCommitters(encodedArgs0, encodedArgs1)
}

/**
 * Performs upkeep on a pool
 * @param poolAddresses array of LeveragedPool addresses to upkeep
 * @param poolKeeper the PoolKeeper object
 * @param l2Encoder the L2Encoder object for encoding function parameters
 * @param signer the ethers Signer object (optional)
 */
export const performUpkeep = async (
    poolAddresses: string[],
    poolKeeper: PoolKeeper,
    l2Encoder: L2Encoder,
    signer?: Signer
): Promise<any> /*Promise<CommitEventArgs>*/ => {
    const encodedArgs = await l2Encoder.encodeAddressArray(poolAddresses)
    signer = signer ? signer : (await ethers.getSigners())[0]
    return poolKeeper
        .connect(signer)
        .performUpkeepMultiplePoolsPacked(encodedArgs)
}

/**
 * Creates a commit and returns the event arguments for it
 * @param pool The pool contract instance
 * @param commitType The type of commit
 * @param amount The amount to commit to
 */
export const createCommit = async (
    l2Encoder: L2Encoder,
    poolCommitter: PoolCommitter,
    commitType: BigNumberish,
    amount: BigNumberish,
    fromAggregateBalance?: boolean,
    payForClaim?: boolean,
    rewardAmount?: BigNumberish,
    signer?: Signer
): Promise<any> /*Promise<CommitEventArgs>*/ => {
    const fromAggBal = fromAggregateBalance ? fromAggregateBalance : false
    const isPayingForClaim = payForClaim ? payForClaim : false
    const encodedArgs = await l2Encoder.encodeCommitParams(
        amount,
        commitType,
        fromAggBal,
        isPayingForClaim
    )
    signer = signer ? signer : (await ethers.getSigners())[0]

    const receipt = await (
        await poolCommitter
            .connect(signer)
            .commit(encodedArgs, { value: rewardAmount })
    ).wait()
    return {
        commitID: getEventArgs(receipt, "CreateCommit")?.commitID,
        amount: getEventArgs(receipt, "CreateCommit")?.amount,
        commitType: getEventArgs(receipt, "CreateCommit")?.commitType,
        appropriateUpdateIntervalId: getEventArgs(receipt, "CreateCommit")
            ?.appropriateUpdateIntervalId,
        receipt: receipt,
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

/*
 * Returns 0 if given LONG_BURN, 1 if given SHORT_BURN, -1 otherwise
 */
export function commitTypeToShadowPoolIndex(commitType: number): number {
    switch (commitType) {
        case LONG_BURN: {
            return 0
        }
        case SHORT_BURN: {
            return 1
        }
        default: {
            return -1
        }
    }
}

/**
 * Deploys a new instance of LeveragedPoolBalanceDrainMock, As well as it's required supporting contracts
 * @param POOL_CODE The pool identifier
 * @param firstPrice The initial value to set the lastPrice variable to in the contract
 * @param updateInterval The update interval value
 * @param frontRunningInterval The front running interval value. Must be less than the update interval
 * @param fee The fund movement fee.
 * @param leverage The amount of leverage the pool will apply
 * @param feeAddress The address to transfer fees to on a fund movement
 * @param amountMinted The amount of test settlement tokens to mint
 * @returns {signers, token, pool, library, shortToken, longToken} An object containing an array of ethers signers, a Contract instance for the token, and a Contract instance for the pool.
 */
export const deployMockPool = async (
    POOL_CODE: string,
    frontRunningInterval: number,
    updateInterval: number,
    leverage: number,
    feeAddress?: string,
    fee?: BigNumberish
): Promise<{
    signers: SignerWithAddress[]
    pool: LeveragedPoolBalanceDrainMock
    token: TestToken
    library: PoolSwapLibrary
    shortToken: ERC20
    longToken: ERC20
    poolCommitter: PoolCommitter
    poolKeeper: PoolKeeper
    chainlinkOracle: TestChainlinkOracle
    factory: PoolFactoryBalanceDrainMock
    oracleWrapper: ChainlinkOracleWrapper
    settlementEthOracle: ChainlinkOracleWrapper
    invariantCheck: InvariantCheck
    autoClaim: AutoClaim
    keeperRewards: KeeperRewards
    l2Encoder: L2Encoder
}> => {
    const amountMinted = DEFAULT_MINT_AMOUNT

    const signers = await ethers.getSigners()

    const l2EncoderFactory = (await ethers.getContractFactory(
        "L2Encoder",
        signers[0]
    )) as L2Encoder__factory
    const l2Encoder = await l2EncoderFactory.deploy()
    await l2Encoder.deployed()

    // Deploy test ERC20 token
    const testToken = (await ethers.getContractFactory(
        "TestToken",
        signers[0]
    )) as TestToken__factory
    const token = await testToken.deploy("TEST TOKEN", "TST1")
    await token.deployed()
    await token.mint(signers[0].address, amountMinted)

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
        chainlinkOracle.address,
        signers[0].address
    )

    /* keeper oracle */
    const settlementEthOracle = await oracleWrapperFactory.deploy(
        ethOracle.address,
        signers[0].address
    )

    // Deploy and initialise pool
    const libraryFactory = (await ethers.getContractFactory(
        "PoolSwapLibrary",
        signers[0]
    )) as PoolSwapLibrary__factory
    const library = await libraryFactory.deploy()
    await library.deployed()

    const PoolFactory = (await ethers.getContractFactory(
        "PoolFactoryBalanceDrainMock",
        {
            signer: signers[0],
            libraries: { PoolSwapLibrary: library.address },
        }
    )) as PoolFactoryBalanceDrainMock__factory

    const factory = await (
        await PoolFactory.deploy(generateRandomAddress(), signers[0].address)
    ).deployed()

    const autoClaimFactory = (await ethers.getContractFactory("AutoClaim", {
        signer: signers[0],
    })) as AutoClaim__factory
    let autoClaim = await autoClaimFactory.deploy(factory.address)
    autoClaim = await autoClaim.deployed()
    await factory.setAutoClaim(autoClaim.address)

    const invariantCheckFactory = (await ethers.getContractFactory(
        "InvariantCheck",
        signers[0]
    )) as InvariantCheck__factory

    const invariantCheck = await invariantCheckFactory.deploy(factory.address)
    await factory.setInvariantCheck(invariantCheck.address)

    const poolKeeperFactory = (await ethers.getContractFactory("PoolKeeper", {
        signer: signers[0],
    })) as PoolKeeper__factory
    let poolKeeper = await poolKeeperFactory.deploy(factory.address)
    poolKeeper = await poolKeeper.deployed()
    await factory.setPoolKeeper(poolKeeper.address)
    await factory.setFee(DEFAULT_FEE)

    const keeperRewardsFactory = (await ethers.getContractFactory(
        "KeeperRewards",
        {
            signer: signers[0],
            libraries: { PoolSwapLibrary: library.address },
        }
    )) as KeeperRewards__factory
    let keeperRewards = await keeperRewardsFactory.deploy(poolKeeper.address)
    await poolKeeper.setKeeperRewards(keeperRewards.address)

    // deploy the pool using the factory, not separately
    const deployParams = {
        poolName: POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: leverage,
        settlementToken: token.address,
        oracleWrapper: oracleWrapper.address,
        settlementEthOracle: settlementEthOracle.address,
        feeController: signers[0].address,
        mintingFee: 0,
        burningFee: 0,
        changeInterval: 0,
    }

    if (fee) {
        await factory.setFee(fee)
    }
    if (feeAddress) {
        await factory.setFeeReceiver(feeAddress)
    }
    await factory.deployPool(deployParams)
    const poolAddress = await factory.pools(0)
    const pool = await ethers.getContractAt(
        "LeveragedPoolBalanceDrainMock",
        poolAddress
    )

    let longTokenAddr = await pool.tokens(0)
    let shortTokenAddr = await pool.tokens(1)
    const longToken = await ethers.getContractAt(ERC20Abi, longTokenAddr)
    const shortToken = await ethers.getContractAt(ERC20Abi, shortTokenAddr)

    let committer = await pool.poolCommitter()
    const poolCommitter = await ethers.getContractAt("PoolCommitter", committer)

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
        invariantCheck,
        autoClaim,
        keeperRewards,
        l2Encoder,
    }
}
