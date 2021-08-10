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
    PriceChangerDeployer__factory,
    TestToken__factory,
} from "../../typechain"

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { OPERATOR_ROLE, ADMIN_ROLE, POOL_CODE, MARKET_CODE } from "../constants"
import { generateRandomAddress } from "../utilities"

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

        const PoolCommiterDeployerFactory = (await ethers.getContractFactory(
            "PoolCommitterDeployer",
            {
                signer: signers[0],
                libraries: { PoolSwapLibrary: library.address },
            }
        )) as PoolCommitterDeployer__factory

        let poolCommiterDeployer = await PoolCommiterDeployerFactory.deploy()
        poolCommiterDeployer = await poolCommiterDeployer.deployed()

        const PriceChangerDeployerFactory = (await ethers.getContractFactory(
            "PriceChangerDeployer",
            {
                signer: signers[0],
                libraries: { PoolSwapLibrary: library.address },
            }
        )) as PriceChangerDeployer__factory

        let priceChangerDeployer = await PriceChangerDeployerFactory.deploy()
        priceChangerDeployer = await priceChangerDeployer.deployed()

        factory = await (
            await PoolFactory.deploy(
                poolCommiterDeployer.address,
                priceChangerDeployer.address
            )
        ).deployed()
        poolKeeper = await poolKeeperFactory.deploy(factory.address)
        await poolKeeper.deployed()

        await factory.setPoolKeeper(poolKeeper.address)

        deploymentData = {
            owner: signers[0].address,
            keeper: poolKeeper.address,
            poolCode: POOL_CODE,
            frontRunningInterval: 3,
            updateInterval: 5,
            fee: "0x00000000000000000000000000000000", // fee as 0
            leverageAmount: 5,
            feeAddress: generateRandomAddress(),
            quoteToken: token.address,
            oracleWrapper: oracleWrapper.address,
        }
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

    it("should revert if the pool already exists", async () => {
        await (await factory.deployPool(deploymentData)).wait()
        await expect(factory.deployPool(deploymentData)).to.be.rejectedWith(
            Error
        )
    })
})
