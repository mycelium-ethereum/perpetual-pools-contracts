import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    PoolKeeper__factory,
    PoolKeeper,
    OracleWrapper__factory,
    OracleWrapper,
    PoolSwapLibrary__factory,
    PoolFactory__factory,
    TestOracle__factory,
    TestOracle
} from "../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    MARKET,
    OPERATOR_ROLE,
    MARKET_2,
    ADMIN_ROLE,
} from "../constants"

chai.use(chaiAsPromised)
const { expect } = chai

describe("PoolKeeper - createMarket", () => {
    let poolKeeper: PoolKeeper
    let oracleWrapper: OracleWrapper
    let signers: SignerWithAddress[]
    let testOracle: TestOracle
    let testOracle2: TestOracle
    beforeEach(async () => {
        // Deploy the contracts
        signers = await ethers.getSigners()

        const oracleWrapperFactory = (await ethers.getContractFactory(
            "OracleWrapper",
            signers[0]
        )) as OracleWrapper__factory
        oracleWrapper = await oracleWrapperFactory.deploy()
        await oracleWrapper.deployed()

        // Deploy the sample oracle
        const oracleFactory = (await ethers.getContractFactory(
            "TestOracle",
            signers[0]
        )) as TestOracle__factory

        testOracle = await oracleFactory.deploy()
        testOracle2 = await oracleFactory.deploy()
        await testOracle.deployed()
        await testOracle2.deployed()

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
        const factory = await (await PoolFactory.deploy()).deployed()
        poolKeeper = await poolKeeperFactory.deploy(
            oracleWrapper.address,
            factory.address
        )
        await poolKeeper.deployed()

        await oracleWrapper.grantRole(
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
            poolKeeper.address
        )

        // Sanity check the deployment
        expect(
            await poolKeeper.hasRole(
                ethers.utils.keccak256(ethers.utils.toUtf8Bytes(ADMIN_ROLE)),
                signers[0].address
            )
        ).to.eq(true)

        expect(
            await oracleWrapper.hasRole(
                ethers.utils.keccak256(ethers.utils.toUtf8Bytes(ADMIN_ROLE)),
                signers[0].address
            )
        ).to.eq(true)
    })

    it("should create a new market with the given oracle", async () => {
        expect(await oracleWrapper.assetOracles(MARKET)).to.eq(
            ethers.constants.AddressZero
        )
        await poolKeeper.createMarket(MARKET, testOracle.address)
        expect(await oracleWrapper.assetOracles(MARKET)).to.eq(testOracle.address)
    })

    it("should revert if the market already exists", async () => {
        expect(await oracleWrapper.assetOracles(MARKET)).to.eq(
            ethers.constants.AddressZero
        )
        await poolKeeper.createMarket(MARKET, testOracle.address)
        expect(await oracleWrapper.assetOracles(MARKET)).to.eq(testOracle.address)
        await expect(
            poolKeeper.createMarket(MARKET, testOracle2.address)
        ).to.be.rejectedWith(Error)
    })
    it("should allow multiple markets to exist", async () => {
        expect(await oracleWrapper.assetOracles(MARKET)).to.eq(
            ethers.constants.AddressZero
        )
        await poolKeeper.createMarket(MARKET, testOracle.address)
        await poolKeeper.createMarket(MARKET_2, testOracle2.address)

        expect(await oracleWrapper.assetOracles(MARKET)).to.eq(testOracle.address)
        expect(await oracleWrapper.assetOracles(MARKET_2)).to.eq(testOracle2.address)
    })
    it("should emit an event containing the details of the new market", async () => {
        const receipt = await (
            await poolKeeper.createMarket(MARKET, testOracle.address)
        ).wait()
        const event = receipt?.events?.find((el) => el.event === "CreateMarket")
        expect(!!event).to.eq(true)
        expect(event?.args?.marketCode).to.eq(MARKET)
        expect(event?.args?.oracle).to.eq(testOracle.address)
    })
})
