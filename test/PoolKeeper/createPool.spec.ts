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
} from "../../typechain"

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    ORACLE,
    OPERATOR_ROLE,
    ADMIN_ROLE,
    POOL_CODE,
    MARKET_CODE,
} from "../constants"
import { generateRandomAddress } from "../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

describe("PoolKeeper - createPool", () => {
    let poolKeeper: PoolKeeper
    let oracleWrapper: OracleWrapper
    let signers: SignerWithAddress[]
    beforeEach(async () => {
        // Deploy the contracts
        signers = await ethers.getSigners()

        const oracleWrapperFactory = (await ethers.getContractFactory(
            "OracleWrapper",
            signers[0]
        )) as OracleWrapper__factory
        oracleWrapper = await oracleWrapperFactory.deploy()
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

    it("should create a new pool in the given market", async () => {
        await poolKeeper.createMarket(MARKET_CODE, ORACLE)
        const receipt = await (
            await poolKeeper.createPool(
                MARKET_CODE,
                POOL_CODE,
                5,
                2,
                "0x00000000000000000000000000000000",
                5,
                generateRandomAddress(),
                generateRandomAddress()
            )
        ).wait()
        const event = receipt?.events?.find((el) => el.event === "CreatePool")

        expect(
            !!(await signers[0].provider?.getCode(event?.args?.poolAddress))
        ).to.eq(true)
    })

    it("should emit an event containing the details of the new pool", async () => {
        await poolKeeper.createMarket(MARKET_CODE, ORACLE)
        const receipt = await (
            await poolKeeper.createPool(
                MARKET_CODE,
                POOL_CODE,
                5,
                2,
                "0x00000000000000000000000000000000",
                5,
                generateRandomAddress(),
                generateRandomAddress()
            )
        ).wait()
        const event = receipt?.events?.find((el) => el.event === "CreatePool")
        expect(!!event).to.eq(true)
        expect(!!event?.args?.poolAddress).to.eq(true)
        expect(!!event?.args?.firstPrice).to.eq(true)
    })

    it("should add the pool to the list of pools", async () => {
        await poolKeeper.createMarket(MARKET_CODE, ORACLE)
        const receipt = await (
            await poolKeeper.createPool(
                MARKET_CODE,
                POOL_CODE,
                5,
                2,
                "0x00000000000000000000000000000000",
                5,
                generateRandomAddress(),
                generateRandomAddress()
            )
        ).wait()
        expect(await poolKeeper.pools(POOL_CODE)).to.eq(
            receipt.events?.find((el) => el.event === "CreatePool")?.args
                ?.poolAddress
        )
    })

    it("should revert if the pool already exists", async () => {
        await poolKeeper.createMarket(MARKET_CODE, ORACLE)
        await (
            await poolKeeper.createPool(
                MARKET_CODE,
                POOL_CODE,
                5,
                2,
                "0x00000000000000000000000000000000",
                5,
                generateRandomAddress(),
                generateRandomAddress()
            )
        ).wait()
        await expect(
            poolKeeper.createPool(
                MARKET_CODE,
                POOL_CODE,
                5,
                2,
                "0x00000000000000000000000000000000",
                5,
                generateRandomAddress(),
                generateRandomAddress()
            )
        ).to.be.rejectedWith(Error)
    })
    it("should revert if the front running interval is larger than the update interval", async () => {
        await expect(
            poolKeeper.createPool(
                MARKET_CODE,
                POOL_CODE,
                5,
                7,
                "0x00000000000000000000000000000000",
                5,
                generateRandomAddress(),
                generateRandomAddress()
            )
        ).to.rejectedWith(Error)
    })
})
