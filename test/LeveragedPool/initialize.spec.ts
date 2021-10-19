import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    TestPoolFactory__factory,
    LeveragedPool,
    TestPoolFactory,
    LeveragedPool__factory,
    TestToken__factory,
    PoolSwapLibrary,
    ERC20,
    ChainlinkOracleWrapper,
    PoolCommitter__factory,
    PoolCommitter,
    InvariantCheck,
} from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    DEFAULT_FEE,
    POOL_CODE,
    POOL_CODE_2,
    DEFAULT_MAX_LEVERAGE,
    DEFAULT_MIN_LEVERAGE,
} from "../constants"
import {
    deployPoolAndTokenContracts,
    deployPoolSetupContracts,
    generateRandomAddress,
    getRandomInt,
} from "../utilities"
import { Contract, Event } from "@ethersproject/contracts"

import { abi as Token } from "../../artifacts/contracts/implementation/PoolToken.sol/PoolToken.json"
import { abi as Pool } from "../../artifacts/contracts/implementation/LeveragedPool.sol/LeveragedPool.json"
import { ContractReceipt } from "ethers"

chai.use(chaiAsPromised)
const { expect } = chai

const feeAddress = generateRandomAddress()

const updateInterval = getRandomInt(99999, 10)
const frontRunningInterval = getRandomInt(updateInterval - 1, 1)
const fee = DEFAULT_FEE
const leverage = getRandomInt(DEFAULT_MAX_LEVERAGE, DEFAULT_MIN_LEVERAGE)

describe("LeveragedPool - initialize", () => {
    let signers: SignerWithAddress[]
    let quoteToken: string
    let short: ERC20
    let long: ERC20
    let oracleWrapper: ChainlinkOracleWrapper
    let settlementEthOracle: ChainlinkOracleWrapper

    before(async () => {
        signers = await ethers.getSigners()
    })
    describe("Initializes contract state and roles", () => {
        let leveragedPool: LeveragedPool
        let receipt: ContractReceipt
        let library: PoolSwapLibrary
        before(async () => {
            const contracts = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee
            )
            leveragedPool = contracts.pool
            library = contracts.library
            quoteToken = contracts.token.address
        })

        it("should set the quote token", async () => {
            expect(await leveragedPool.quoteToken()).to.eq(quoteToken)
        })

        it("should set the last price timestamp", async () => {
            expect(await leveragedPool.lastPriceTimestamp()).to.not.eq(0)
        })

        it("should set the fee address", async () => {
            expect(await leveragedPool.feeAddress()).to.eq(feeAddress)
        })

        it("should set the front running interval", async () => {
            expect(await leveragedPool.frontRunningInterval()).to.eq(
                frontRunningInterval
            )
        })

        it("should set the leverage amount", async () => {
            expect(
                await library.convertDecimalToUInt(
                    await leveragedPool.leverageAmount()
                )
            ).to.eq(leverage)
        })

        it("should set the fee", async () => {
            const feeBytes = 0x00000000000000000000000000000000
            expect(feeBytes.toString()).to.eq(fee.toString())
        })

        it("should set the pool code", async () => {
            expect(await leveragedPool.poolName()).to.eq(
                `${leverage}-${POOL_CODE}`
            )
        })

        it("should deploy two ERC20 tokens for the long/short pairs", async () => {
            // Check tokens array. Index 0 must be the LONG token, and index 1 the SHORT token.
            const longAddress = await leveragedPool.tokens(0)
            const shortAddress = await leveragedPool.tokens(1)

            const longToken = new ethers.Contract(
                longAddress,
                Token,
                signers[0]
            )
            const shortToken = new ethers.Contract(
                shortAddress,
                Token,
                signers[0]
            )

            expect(longAddress).to.not.eq(ethers.constants.AddressZero)
            expect(shortAddress).to.not.eq(ethers.constants.AddressZero)
            expect(await longToken.symbol()).to.eq(
                leverage.toString().concat("L-".concat(POOL_CODE))
            )
            expect(await shortToken.symbol()).to.eq(
                leverage.toString().concat("S-".concat(POOL_CODE))
            )
            expect(await longToken.name()).to.eq(
                leverage.toString().concat("L-".concat(POOL_CODE))
            )
            expect(await shortToken.name()).to.eq(
                leverage.toString().concat("S-".concat(POOL_CODE))
            )
            // check decimals
            expect(await shortToken.decimals()).to.eq(18)
            expect(await longToken.decimals()).to.eq(18)
        })

        it("should emit an event containing the details of the new pool", async () => {
            const leveragedPoolFactory = (await ethers.getContractFactory(
                "LeveragedPool",
                {
                    signer: signers[0],
                    libraries: { PoolSwapLibrary: library.address },
                }
            )) as LeveragedPool__factory
            const setupContracts = await deployPoolSetupContracts()
            library = setupContracts.library
            oracleWrapper = setupContracts.oracleWrapper
            settlementEthOracle = setupContracts.settlementEthOracle
            quoteToken = setupContracts.token.address
            const pool = await leveragedPoolFactory.deploy()
            await pool.deployed()
            const poolTokenFactory = (await ethers.getContractFactory(
                "TestToken",
                signers[0]
            )) as TestToken__factory
            short = await poolTokenFactory.deploy(
                POOL_CODE.concat("-SHORT"),
                "S-".concat(POOL_CODE)
            )
            await short.deployed()

            long = await poolTokenFactory.deploy(
                POOL_CODE.concat("-LONG"),
                "L-".concat(POOL_CODE)
            )
            await long.deployed()

            const poolCommitterFactory = (await ethers.getContractFactory(
                "PoolCommitter",
                {
                    signer: signers[0],
                    libraries: { PoolSwapLibrary: library.address },
                }
            )) as PoolCommitter__factory

            const poolCommitter = await (
                await poolCommitterFactory.deploy(
                    setupContracts.factory.address,
                    setupContracts.invariantCheck.address
                )
            ).deployed()

            const testFactory = (await ethers.getContractFactory(
                "TestPoolFactory",
                signers[0]
            )) as TestPoolFactory__factory
            const testFactoryActual = await testFactory.deploy(pool.address)
            await testFactoryActual.deployed()

            const factoryReceipt = await (
                await testFactoryActual.createPool(POOL_CODE)
            ).wait()
            leveragedPool = new ethers.Contract(
                factoryReceipt?.events?.find(
                    (el: Event) => el.event === "DeployPool"
                )?.args?.pool,
                Pool,
                signers[0]
            ) as LeveragedPool

            receipt = await (
                await leveragedPool.initialize({
                    _owner: signers[0].address,
                    _keeper: generateRandomAddress(),
                    _oracleWrapper: oracleWrapper.address,
                    _settlementEthOracle: settlementEthOracle.address,
                    _longToken: long.address,
                    _shortToken: short.address,
                    _poolCommitter: poolCommitter.address,
                    _poolName: POOL_CODE,
                    _frontRunningInterval: frontRunningInterval,
                    _updateInterval: updateInterval,
                    _fee: fee,
                    _leverageAmount: leverage,
                    _feeAddress: feeAddress,
                    _quoteToken: quoteToken,
                    _invariantCheckContract:
                        setupContracts.invariantCheck.address,
                })
            ).wait()
            const event: Event | undefined = receipt?.events?.find(
                (el: Event) => el.event === "PoolInitialized"
            )
            expect(!!event).to.eq(true)
            expect(!!event?.args?.longToken).to.eq(true)
            expect(!!event?.args?.shortToken).to.eq(true)
            expect(event?.args?.quoteToken).to.eq(quoteToken)
            expect(event?.args?.poolName).to.eq(POOL_CODE)
        })
    })

    context("Performs safety checks", () => {
        let leveragedPool: LeveragedPool
        let testFactoryActual: TestPoolFactory
        let poolCommitter: PoolCommitter
        let invariantCheck: InvariantCheck
        let long: Contract
        let short: Contract
        beforeEach(async () => {
            const setupContracts = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee
            )
            oracleWrapper = setupContracts.oracleWrapper
            settlementEthOracle = setupContracts.settlementEthOracle
            quoteToken = setupContracts.token.address
            poolCommitter = setupContracts.poolCommitter
            invariantCheck = setupContracts.invariantCheck
            long = setupContracts.longToken
            short = setupContracts.shortToken

            const testFactory = (await ethers.getContractFactory(
                "TestPoolFactory",
                signers[0]
            )) as TestPoolFactory__factory
            testFactoryActual = await testFactory.deploy(
                setupContracts.pool.address
            )
            await testFactoryActual.deployed()
            const factoryReceipt = await (
                await testFactoryActual.createPool(POOL_CODE)
            ).wait()

            leveragedPool = new ethers.Contract(
                factoryReceipt?.events?.find(
                    (el: Event) => el.event === "DeployPool"
                )?.args?.pool,
                Pool,
                signers[0]
            ) as LeveragedPool

            await leveragedPool.deployed()
        })

        it("should revert if an attempt is made to run it a second time", async () => {
            await leveragedPool.initialize({
                _owner: signers[0].address,
                _keeper: generateRandomAddress(),
                _oracleWrapper: oracleWrapper.address,
                _settlementEthOracle: settlementEthOracle.address,
                _longToken: long.address,
                _shortToken: short.address,
                _poolCommitter: poolCommitter.address,
                _poolName: POOL_CODE,
                _frontRunningInterval: frontRunningInterval,
                _updateInterval: updateInterval,
                _fee: fee,
                _leverageAmount: leverage,
                _feeAddress: feeAddress,
                _quoteToken: quoteToken,
                _invariantCheckContract: invariantCheck.address,
            })
            await expect(
                leveragedPool.initialize({
                    _owner: signers[0].address,
                    _keeper: generateRandomAddress(),
                    _oracleWrapper: oracleWrapper.address,
                    _settlementEthOracle: settlementEthOracle.address,
                    _longToken: long.address,
                    _shortToken: short.address,
                    _poolCommitter: poolCommitter.address,
                    _poolName: POOL_CODE,
                    _frontRunningInterval: frontRunningInterval,
                    _updateInterval: updateInterval,
                    _fee: fee,
                    _leverageAmount: leverage,
                    _feeAddress: feeAddress,
                    _quoteToken: quoteToken,
                    _invariantCheckContract: invariantCheck.address,
                })
            ).to.rejectedWith(Error)
        })
        it("should revert if quoteToken address is the zero address", async () => {
            await expect(
                leveragedPool.initialize({
                    _owner: signers[0].address,
                    _keeper: generateRandomAddress(),
                    _oracleWrapper: oracleWrapper.address,
                    _settlementEthOracle: settlementEthOracle.address,
                    _longToken: long.address,
                    _shortToken: short.address,
                    _poolCommitter: poolCommitter.address,
                    _poolName: POOL_CODE,
                    _frontRunningInterval: frontRunningInterval,
                    _updateInterval: updateInterval,
                    _fee: fee,
                    _leverageAmount: leverage,
                    _feeAddress: feeAddress,
                    _quoteToken: ethers.constants.AddressZero,
                    _invariantCheckContract: invariantCheck.address,
                })
            ).to.rejectedWith(Error)
        })
        it("should revert if oracleWrapper address is the zero address", async () => {
            await expect(
                leveragedPool.initialize({
                    _owner: signers[0].address,
                    _keeper: generateRandomAddress(),
                    _oracleWrapper: ethers.constants.AddressZero,
                    _settlementEthOracle: ethers.constants.AddressZero,
                    _longToken: long.address,
                    _shortToken: short.address,
                    _poolCommitter: poolCommitter.address,
                    _poolName: POOL_CODE,
                    _frontRunningInterval: frontRunningInterval,
                    _updateInterval: updateInterval,
                    _fee: fee,
                    _leverageAmount: leverage,
                    _feeAddress: feeAddress,
                    _quoteToken: quoteToken,
                    _invariantCheckContract: invariantCheck.address,
                })
            ).to.rejectedWith(Error)
        })
        it("should revert if the fee address is the zero address", async () => {
            await expect(
                leveragedPool.initialize({
                    _owner: signers[0].address,
                    _keeper: generateRandomAddress(),
                    _oracleWrapper: oracleWrapper.address,
                    _settlementEthOracle: settlementEthOracle.address,
                    _longToken: long.address,
                    _shortToken: short.address,
                    _poolCommitter: poolCommitter.address,
                    _poolName: POOL_CODE,
                    _frontRunningInterval: frontRunningInterval,
                    _updateInterval: updateInterval,
                    _fee: fee,
                    _leverageAmount: leverage,
                    _feeAddress: ethers.constants.AddressZero,
                    _quoteToken: quoteToken,
                    _invariantCheckContract: invariantCheck.address,
                })
            ).to.rejectedWith(Error)
        })
        it("should revert if the updateInterval is less than frontRunningInterval", async () => {
            // the generated variable `updateInterval` is greater than `frontRunningInterval`
            await expect(
                leveragedPool.initialize({
                    _owner: signers[0].address,
                    _keeper: generateRandomAddress(),
                    _oracleWrapper: oracleWrapper.address,
                    _settlementEthOracle: settlementEthOracle.address,
                    _longToken: long.address,
                    _shortToken: short.address,
                    _poolCommitter: poolCommitter.address,
                    _poolName: POOL_CODE,
                    _frontRunningInterval: updateInterval,
                    _updateInterval: frontRunningInterval,
                    _fee: fee,
                    _leverageAmount: leverage,
                    _feeAddress: feeAddress,
                    _quoteToken: quoteToken,
                    _invariantCheckContract: invariantCheck.address,
                })
            ).to.rejectedWith("frontRunning > updateInterval")
        })
        it("should be able to coexist with other clones", async () => {
            const secondPoolReceipt = await (
                await testFactoryActual.createPool(POOL_CODE_2)
            ).wait()
            const secondPool = new ethers.Contract(
                secondPoolReceipt?.events?.find(
                    (el: Event) => el.event === "DeployPool"
                )?.args?.pool,
                Pool,
                signers[0]
            ) as LeveragedPool
            await secondPool.initialize({
                _owner: signers[0].address,
                _keeper: generateRandomAddress(),
                _oracleWrapper: oracleWrapper.address,
                _settlementEthOracle: settlementEthOracle.address,
                _longToken: long.address,
                _shortToken: short.address,
                _poolCommitter: poolCommitter.address,
                _poolName: POOL_CODE_2,
                _frontRunningInterval: frontRunningInterval,
                _updateInterval: updateInterval,
                _fee: fee,
                _leverageAmount: leverage,
                _feeAddress: feeAddress,
                _quoteToken: quoteToken,
                _invariantCheckContract: invariantCheck.address,
            })
            await leveragedPool.initialize({
                _owner: signers[0].address,
                _keeper: generateRandomAddress(),
                _oracleWrapper: oracleWrapper.address,
                _settlementEthOracle: settlementEthOracle.address,
                _longToken: long.address,
                _shortToken: short.address,
                _poolCommitter: poolCommitter.address,
                _poolName: POOL_CODE,
                _frontRunningInterval: frontRunningInterval,
                _updateInterval: updateInterval,
                _fee: fee,
                _leverageAmount: leverage,
                _feeAddress: feeAddress,
                _quoteToken: quoteToken,
                _invariantCheckContract: invariantCheck.address,
            })

            expect(await secondPool.poolName()).to.eq(POOL_CODE_2)
            expect(await leveragedPool.poolName()).to.eq(POOL_CODE)
        })
    })
})
