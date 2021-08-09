import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    TestPoolFactory__factory,
    LeveragedPool,
    TestPoolFactory,
    LeveragedPool__factory,
    TestToken__factory,
    PoolSwapLibrary__factory,
    PoolSwapLibrary,
    ERC20,
    TestChainlinkOracle__factory,
    TestOracleWrapper__factory,
    TestOracleWrapper,
} from "../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    ADMIN_ROLE,
    FEE_HOLDER_ROLE,
    POOL_CODE,
    POOL_CODE_2,
    UPDATER_ROLE,
} from "../constants"
import { generateRandomAddress, getRandomInt } from "../utilities"
import { Event } from "@ethersproject/contracts"

import { abi as Token } from "../../artifacts/contracts/implementation/PoolToken.sol/PoolToken.json"
import { abi as Pool } from "../../artifacts/contracts/implementation/LeveragedPool.sol/LeveragedPool.json"
import { ContractReceipt } from "ethers"

chai.use(chaiAsPromised)
const { expect } = chai

const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()

const updateInterval = getRandomInt(99999, 10)
const frontRunningInterval = getRandomInt(updateInterval - 1, 1)
const fee = "0x00000000000000000000000000000000"
const leverage = getRandomInt(256, 1)

describe("LeveragedPool - initialize", () => {
    let signers: SignerWithAddress[]
    let quoteToken: string
    let short: ERC20
    let long: ERC20
    let oracleWrapper: TestOracleWrapper
    let keeperOracle: TestOracleWrapper

    before(async () => {
        signers = await ethers.getSigners()
    })
    describe("Initializes contract state and roles", () => {
        let leveragedPool: LeveragedPool
        let receipt: ContractReceipt
        let library: PoolSwapLibrary
        before(async () => {
            // Deploy the contracts
            const testToken = (await ethers.getContractFactory(
                "TestToken",
                signers[0]
            )) as TestToken__factory
            const token = await testToken.deploy("TEST TOKEN", "TST1")
            await token.deployed()
            await token.mint(amountMinted, signers[0].address)
            quoteToken = token.address
            // Pair tokens

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
            const libraryFactory = (await ethers.getContractFactory(
                "PoolSwapLibrary",
                signers[0]
            )) as PoolSwapLibrary__factory
            library = await libraryFactory.deploy()
            await library.deployed()

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

            const leveragedPoolFactory = (await ethers.getContractFactory(
                "LeveragedPool",
                {
                    signer: signers[0],
                    libraries: { PoolSwapLibrary: library.address },
                }
            )) as LeveragedPool__factory
            const pool = await leveragedPoolFactory.deploy()
            await pool.deployed()
            const initialization = {
                _owner: signers[0].address,
                _keeper: generateRandomAddress(),
                _oracleWrapper: oracleWrapper.address,
                _keeperOracle: keeperOracle.address,
                _longToken: long.address,
                _shortToken: short.address,
                _poolCode: POOL_CODE,
                _frontRunningInterval: frontRunningInterval,
                _updateInterval: updateInterval,
                _fee: fee,
                _leverageAmount: leverage,
                _feeAddress: feeAddress,
                _quoteToken: token.address,
            }
            await (await pool.initialize(initialization)).wait()
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
                    _keeperOracle: keeperOracle.address,
                    _longToken: long.address,
                    _shortToken: short.address,
                    _poolCode: POOL_CODE,
                    _frontRunningInterval: frontRunningInterval,
                    _updateInterval: updateInterval,
                    _fee: fee,
                    _leverageAmount: leverage,
                    _feeAddress: feeAddress,
                    _quoteToken: quoteToken,
                })
            ).wait()
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
            expect(await leveragedPool.fee()).to.eq(fee)
        })

        it("should set the pool code", async () => {
            expect(await leveragedPool.poolCode()).to.eq(POOL_CODE)
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
            expect(await longToken.symbol()).to.eq("L-".concat(POOL_CODE))
            expect(await shortToken.symbol()).to.eq("S-".concat(POOL_CODE))
            expect(await longToken.name()).to.eq(POOL_CODE.concat("-LONG"))
            expect(await shortToken.name()).to.eq(POOL_CODE.concat("-SHORT"))
        })

        it("should emit an event containing the details of the new pool", async () => {
            const event: Event | undefined = receipt?.events?.find(
                (el: Event) => el.event === "PoolInitialized"
            )
            expect(!!event).to.eq(true)
            expect(!!event?.args?.longToken).to.eq(true)
            expect(!!event?.args?.shortToken).to.eq(true)
            expect(event?.args?.quoteToken).to.eq(quoteToken)
            expect(event?.args?.poolCode).to.eq(POOL_CODE)
        })
    })
    describe("Performs safety checks", () => {
        let leveragedPool: LeveragedPool
        let testFactoryActual: TestPoolFactory
        beforeEach(async () => {
            // Deploy the contracts
            const testToken = (await ethers.getContractFactory(
                "TestToken",
                signers[0]
            )) as TestToken__factory
            const token = await testToken.deploy("TEST TOKEN", "TST1")
            await token.deployed()
            await token.mint(amountMinted, signers[0].address)
            quoteToken = token.address
            const libraryFactory = (await ethers.getContractFactory(
                "PoolSwapLibrary",
                signers[0]
            )) as PoolSwapLibrary__factory
            const library = await libraryFactory.deploy()
            await library.deployed()

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
            oracleWrapper = await oracleWrapperFactory.deploy(
                chainlinkOracle.address
            )

            keeperOracle = await oracleWrapperFactory.deploy(
                chainlinkOracle.address
            )

            const leveragedPoolFactory = (await ethers.getContractFactory(
                "LeveragedPool",
                {
                    signer: signers[0],
                    libraries: { PoolSwapLibrary: library.address },
                }
            )) as LeveragedPool__factory
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
            const pool = await leveragedPoolFactory.deploy()
            await pool.deployed()
            await (
                await pool.initialize({
                    _owner: signers[0].address,
                    _keeper: generateRandomAddress(),
                    _oracleWrapper: oracleWrapper.address,
                    _keeperOracle: keeperOracle.address,
                    _longToken: long.address,
                    _shortToken: short.address,
                    _poolCode: POOL_CODE,
                    _frontRunningInterval: frontRunningInterval,
                    _updateInterval: updateInterval,
                    _fee: fee,
                    _leverageAmount: leverage,
                    _feeAddress: feeAddress,
                    _quoteToken: token.address,
                })
            ).wait()
            const testFactory = (await ethers.getContractFactory(
                "TestPoolFactory",
                signers[0]
            )) as TestPoolFactory__factory
            testFactoryActual = await testFactory.deploy(pool.address)
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
                _keeperOracle: keeperOracle.address,
                _longToken: long.address,
                _shortToken: short.address,
                _poolCode: POOL_CODE,
                _frontRunningInterval: frontRunningInterval,
                _updateInterval: updateInterval,
                _fee: fee,
                _leverageAmount: leverage,
                _feeAddress: feeAddress,
                _quoteToken: quoteToken,
            })
            await expect(
                leveragedPool.initialize({
                    _owner: signers[0].address,
                    _keeper: generateRandomAddress(),
                    _oracleWrapper: oracleWrapper.address,
                    _keeperOracle: keeperOracle.address,
                    _longToken: long.address,
                    _shortToken: short.address,
                    _poolCode: POOL_CODE,
                    _frontRunningInterval: frontRunningInterval,
                    _updateInterval: updateInterval,
                    _fee: fee,
                    _leverageAmount: leverage,
                    _feeAddress: feeAddress,
                    _quoteToken: quoteToken,
                })
            ).to.rejectedWith(Error)
        })
        it("should revert if quoteToken address is the zero address", async () => {
            await expect(
                leveragedPool.initialize({
                    _owner: signers[0].address,
                    _keeper: generateRandomAddress(),
                    _oracleWrapper: oracleWrapper.address,
                    _keeperOracle: keeperOracle.address,
                    _longToken: long.address,
                    _shortToken: short.address,
                    _poolCode: POOL_CODE,
                    _frontRunningInterval: frontRunningInterval,
                    _updateInterval: updateInterval,
                    _fee: fee,
                    _leverageAmount: leverage,
                    _feeAddress: feeAddress,
                    _quoteToken: ethers.constants.AddressZero,
                })
            ).to.rejectedWith(Error)
        })
        it("should revert if the fee address is the zero address", async () => {
            await expect(
                leveragedPool.initialize({
                    _owner: signers[0].address,
                    _keeper: generateRandomAddress(),
                    _oracleWrapper: oracleWrapper.address,
                    _keeperOracle: keeperOracle.address,
                    _longToken: long.address,
                    _shortToken: short.address,
                    _poolCode: POOL_CODE,
                    _frontRunningInterval: frontRunningInterval,
                    _updateInterval: updateInterval,
                    _fee: fee,
                    _leverageAmount: leverage,
                    _feeAddress: ethers.constants.AddressZero,
                    _quoteToken: quoteToken,
                })
            ).to.rejectedWith(Error)
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
                _keeperOracle: keeperOracle.address,
                _longToken: long.address,
                _shortToken: short.address,
                _poolCode: POOL_CODE_2,
                _frontRunningInterval: frontRunningInterval,
                _updateInterval: updateInterval,
                _fee: fee,
                _leverageAmount: leverage,
                _feeAddress: feeAddress,
                _quoteToken: quoteToken,
            })
            await leveragedPool.initialize({
                _owner: signers[0].address,
                _keeper: generateRandomAddress(),
                _oracleWrapper: oracleWrapper.address,
                _keeperOracle: keeperOracle.address,
                _longToken: long.address,
                _shortToken: short.address,
                _poolCode: POOL_CODE,
                _frontRunningInterval: frontRunningInterval,
                _updateInterval: updateInterval,
                _fee: fee,
                _leverageAmount: leverage,
                _feeAddress: feeAddress,
                _quoteToken: quoteToken,
            })

            expect(await secondPool.poolCode()).to.eq(POOL_CODE_2)
            expect(await leveragedPool.poolCode()).to.eq(POOL_CODE)
        })
    })
})
