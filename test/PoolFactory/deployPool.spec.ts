import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    PoolFactory,
    PoolFactory__factory,
    PoolKeeper,
    PoolKeeper__factory,
    PoolSwapLibrary__factory,
    TestOracleWrapper,
    TestOracleWrapper__factory,
    TestChainlinkOracle__factory,
} from "../../typechain"
import { POOL_CODE, POOL_CODE_2 } from "../constants"
import { generateRandomAddress, getEventArgs } from "../utilities"
import { Result } from "ethers/lib/utils"
import LeveragedPoolInterface from "../../artifacts/contracts/implementation/LeveragedPool.sol/LeveragedPool.json"

chai.use(chaiAsPromised)
const { expect } = chai
describe("PoolFactory - deployPool", () => {
    let factory: PoolFactory
    let poolKeeper: PoolKeeper
    let oracleWrapper: TestOracleWrapper
    let poolTx: Result | undefined
    let pool: LeveragedPool
    before(async () => {
        const signers = await ethers.getSigners()

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

        const oracleWrapperFactory = (await ethers.getContractFactory(
            "TestOracleWrapper",
            signers[0]
        )) as TestOracleWrapper__factory
        oracleWrapper = await oracleWrapperFactory.deploy(
            chainlinkOracle.address
        )
        await oracleWrapper.deployed()

        const PoolFactory = (await ethers.getContractFactory("PoolFactory", {
            signer: signers[0],
            libraries: { PoolSwapLibrary: library.address },
        })) as PoolFactory__factory
        factory = await (await PoolFactory.deploy()).deployed()
        const poolKeeperFactory = (await ethers.getContractFactory(
            "PoolKeeper",
            {
                signer: signers[0],
            }
        )) as PoolKeeper__factory
        poolKeeper = await poolKeeperFactory.deploy(factory.address)
        await poolKeeper.deployed()

        await factory.setPoolKeeper(poolKeeper.address)
        const deploymentData = {
            owner: generateRandomAddress(),
            poolCode: POOL_CODE,
            frontRunningInterval: 5,
            updateInterval: 10,
            fee: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
            leverageAmount: 5,
            feeAddress: generateRandomAddress(),
            quoteToken: generateRandomAddress(),
            oracleWrapper: oracleWrapper.address,
        }
        poolTx = getEventArgs(
            await (await factory.deployPool(deploymentData)).wait(),
            "DeployPool"
        )
        pool = new ethers.Contract(
            poolTx?.pool,
            LeveragedPoolInterface.abi,
            (await ethers.getSigners())[0]
        ) as LeveragedPool
    })
    it("should deploy a minimal clone", async () => {
        expect(await pool.poolCode()).to.eq(POOL_CODE)
    })
    it("should initialize the clone", async () => {
        await expect(
            pool.initialize(
                generateRandomAddress(),
                generateRandomAddress(),
                generateRandomAddress(),
                generateRandomAddress(),
                POOL_CODE,
                5,
                3,
                [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
                5,
                generateRandomAddress(),
                generateRandomAddress(),
                generateRandomAddress()
            )
        ).to.be.rejectedWith(Error)
    })
    it("should allow multiple clones to exist", async () => {
        const deploymentData = {
            owner: generateRandomAddress(),
            poolCode: POOL_CODE_2,
            frontRunningInterval: 5,
            updateInterval: 3,
            fee: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
            leverageAmount: 5,
            feeAddress: generateRandomAddress(),
            quoteToken: generateRandomAddress(),
            oracleWrapper: oracleWrapper.address,
        }
        const secondPool = getEventArgs(
            await (await factory.deployPool(deploymentData)).wait(),
            "DeployPool"
        )
        const pool2 = new ethers.Contract(
            secondPool?.pool,
            LeveragedPoolInterface.abi,
            (await ethers.getSigners())[0]
        ) as LeveragedPool
        expect(await pool2.poolCode()).to.eq(POOL_CODE_2)
        expect(await pool.poolCode()).to.eq(POOL_CODE)
    })
})
