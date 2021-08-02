import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    PoolFactory,
    PoolFactory__factory,
    PoolSwapLibrary__factory,
} from "../../typechain"
import { POOL_CODE, POOL_CODE_2 } from "../constants"
import { generateRandomAddress, getEventArgs } from "../utilities"
import { Result } from "ethers/lib/utils"
import LeveragedPoolInterface from "../../artifacts/contracts/implementation/LeveragedPool.sol/LeveragedPool.json"

chai.use(chaiAsPromised)
const { expect } = chai
describe("PoolFactory - deployPool", () => {
    let factory: PoolFactory
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

        const PoolFactory = (await ethers.getContractFactory("PoolFactory", {
            signer: signers[0],
            libraries: { PoolSwapLibrary: library.address },
        })) as PoolFactory__factory
        factory = await (await PoolFactory.deploy()).deployed()
        const deploymentData = {
            owner: generateRandomAddress(),
            poolCode: POOL_CODE,
            frontRunningInterval: 5,
            updateInterval: 10,
            fee: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
            leverageAmount: 5,
            feeAddress: generateRandomAddress(),
            quoteToken: generateRandomAddress(),
            oracleWrapper: generateRandomAddress(),
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
            oracleWrapper: generateRandomAddress(),
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
