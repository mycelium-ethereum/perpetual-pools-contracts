import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { generateRandomAddress } from "../utilities"

import { MARKET_2, POOL_CODE } from "../constants"
import {
    PoolFactory__factory,
    PoolKeeper,
    PoolKeeper__factory,
    PoolSwapLibrary__factory,
    TestOracleWrapper,
    TestOracleWrapper__factory,
    TestToken__factory,
} from "../../typechain"
import { MARKET, POOL_CODE_2 } from "../constants"

chai.use(chaiAsPromised)
const { expect } = chai

let quoteToken: string
let oracleWrapper: TestOracleWrapper
let poolKeeper: PoolKeeper

const setupHook = async () => {
    const signers = await ethers.getSigners()
    // Deploy quote token
    const testToken = (await ethers.getContractFactory(
        "TestToken",
        signers[0]
    )) as TestToken__factory
    const token = await testToken.deploy("TEST TOKEN", "TST1")
    await token.deployed()
    await token.mint(10000, signers[0].address)
    quoteToken = token.address

    // Deploy oracle. Using a test oracle for predictability
    const oracleWrapperFactory = (await ethers.getContractFactory(
        "TestOracleWrapper",
        signers[0]
    )) as TestOracleWrapper__factory
    oracleWrapper = await oracleWrapperFactory.deploy()
    await oracleWrapper.deployed()

    // Deploy pool keeper
    const libraryFactory = (await ethers.getContractFactory(
        "PoolSwapLibrary",
        signers[0]
    )) as PoolSwapLibrary__factory
    const library = await libraryFactory.deploy()
    await library.deployed()
    const poolKeeperFactory = (await ethers.getContractFactory("PoolKeeper", {
        signer: signers[0],
    })) as PoolKeeper__factory
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

    // Create pool
    await oracleWrapper.increasePrice()
    await poolKeeper.createMarket(MARKET, oracleWrapper.address)
    await poolKeeper.createPool(
        MARKET,
        POOL_CODE,
        2,
        1,
        "0x00000000000000000000000000000000",
        1,
        generateRandomAddress(),
        quoteToken
    )
    await poolKeeper.createPool(
        MARKET,
        POOL_CODE_2,
        2,
        1,
        "0x00000000000000000000000000000000",
        2,
        generateRandomAddress(),
        quoteToken
    )
}
const callData = ethers.utils.defaultAbiCoder.encode(
    [
        ethers.utils.ParamType.from("uint32"),
        ethers.utils.ParamType.from("string"),
        ethers.utils.ParamType.from("address[]"),
    ],
    [2, MARKET, [POOL_CODE, POOL_CODE_2]]
)
describe("PoolKeeper - checkUpkeep", () => {
    beforeEach(async () => {
        await setupHook()
    })
    it("should return true if the trigger condition is met", async () => {
        expect((await poolKeeper.checkUpkeep(callData))[0]).to.eq(true)
    })
    it("should return false if the trigger condition isn't met", async () => {
        await poolKeeper.performUpkeep(callData)
        expect((await poolKeeper.checkUpkeep(callData))[0]).to.eq(false)
    })
    it("should return the correct perform data to call for upkeep with", async () => {
        // Should be market code [pool codes]
        expect((await poolKeeper.checkUpkeep(callData))[1]).to.eq(callData)
    })
    it("should return false if the check data provided is invalid", async () => {
        const falseCallData = ethers.utils.defaultAbiCoder.encode(
            [
                ethers.utils.ParamType.from("uint32"),
                ethers.utils.ParamType.from("string"),
                ethers.utils.ParamType.from("address[]"),
            ],
            [2, MARKET_2, [POOL_CODE, POOL_CODE_2]]
        )
        expect((await poolKeeper.checkUpkeep(falseCallData))[0]).to.eq(false)
    })
})
