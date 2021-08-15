import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    PoolKeeper__factory,
    PoolKeeper,
    PoolSwapLibrary__factory,
    PoolFactory__factory,
    TestOracleWrapper__factory,
    TestChainlinkOracle__factory,
    TestOracleWrapper,
    PoolFactory,
    PoolCommitterDeployer__factory,
    TestToken__factory,
} from "../../typechain"

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { OPERATOR_ROLE, ADMIN_ROLE, POOL_CODE, MARKET_CODE } from "../constants"
import { generateRandomAddress } from "../utilities"
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils"
import { BigNumber } from "ethers"

chai.use(chaiAsPromised)
const { expect } = chai

let deploymentData: any

describe("PoolKeeper - createPool", () => {
    let poolKeeper: PoolKeeper
    let factory: PoolFactory
    let signers: SignerWithAddress[]
    beforeEach(async () => {
        // Deploy the contracts
        signers = await ethers.getSigners()

        const testToken = (await ethers.getContractFactory(
            "TestToken",
            signers[0]
        )) as TestToken__factory
        const token = await testToken.deploy("TEST TOKEN", "TST1")
        await token.deployed()
        await token.mint(ethers.utils.parseEther("10000"), signers[0].address)

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
        await oracleWrapper.deployed()

        const keeperOracle = await oracleWrapperFactory.deploy(
            chainlinkOracle.address
        )
        await keeperOracle.deployed()

        const libraryFactory = (await ethers.getContractFactory(
            "PoolSwapLibrary",
            signers[0]
        )) as PoolSwapLibrary__factory
        const library = await libraryFactory.deploy()
        await library.deployed()
        const poolKeeperFactory = (await ethers.getContractFactory(
            "PoolKeeper",
            {
                signer: signers[0],
            }
        )) as PoolKeeper__factory
        const PoolFactory = (await ethers.getContractFactory("PoolFactory", {
            signer: signers[0],
            libraries: { PoolSwapLibrary: library.address },
        })) as PoolFactory__factory
        factory = await (
            await PoolFactory.deploy(generateRandomAddress())
        ).deployed()

        const PoolCommiterDeployerFactory = (await ethers.getContractFactory(
            "PoolCommitterDeployer",
            {
                signer: signers[0],
                libraries: { PoolSwapLibrary: library.address },
            }
        )) as PoolCommitterDeployer__factory

        let poolCommiterDeployer = await PoolCommiterDeployerFactory.deploy(
            factory.address
        )
        poolCommiterDeployer = await poolCommiterDeployer.deployed()

        await factory.setPoolCommitterDeployer(poolCommiterDeployer.address)

        poolKeeper = await poolKeeperFactory.deploy(factory.address)
        await poolKeeper.deployed()

        await factory.setPoolKeeper(poolKeeper.address)

        deploymentData = {
            owner: signers[0].address,
            keeper: poolKeeper.address,
            poolName: POOL_CODE,
            frontRunningInterval: 3,
            updateInterval: 5,
            leverageAmount: 5,
            feeAddress: generateRandomAddress(),
            quoteToken: token.address,
            oracleWrapper: oracleWrapper.address,
            keeperOracle: keeperOracle.address,
        }
    })

    it("should Revert if leverageAmount == 0 and if leveragedAmount > maxLeverage", async () => {
        deploymentData.leverageAmount = 0
        await expect(factory.deployPool(deploymentData)).to.be.revertedWith(
            "PoolKeeper: leveraged amount invalid"
        )
        deploymentData.leverageAmount = (await factory.maxLeverage()) + 1
        await expect(factory.deployPool(deploymentData)).to.be.revertedWith(
            "PoolKeeper: leveraged amount invalid"
        )
    })

    it("should Revert if fee > one (in ABDK Math IEEE precision)", async () => {
        const justAboveOne = "0x3fff0000000000000000000000000001"
        await factory.setFee(justAboveOne)
        await expect(factory.deployPool(deploymentData)).to.be.revertedWith(
            "Fee is greater than 100%"
        )
    })

    it("should create a new pool in the given market", async () => {
        const receipt = await (await factory.deployPool(deploymentData)).wait()
        const event = receipt?.events?.find((el) => el.event === "DeployPool")
        expect(!!(await signers[0].provider?.getCode(event?.args?.pool))).to.eq(
            true
        )
    })

    it("should emit an event containing the details of the new pool", async () => {
        const receipt = await (await factory.deployPool(deploymentData)).wait()
        const event = receipt?.events?.find((el) => el.event === "DeployPool")
        expect(!!event).to.eq(true)
        expect(!!event?.args?.pool).to.eq(true)
    })
})
