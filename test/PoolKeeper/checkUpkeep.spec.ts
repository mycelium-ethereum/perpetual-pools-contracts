import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { generateRandomAddress } from "../utilities"

import { MARKET_2, POOL_CODE, POOL_CODE_2 } from "../constants"
import {
    TestChainlinkOracle,
    TestChainlinkOracleWrapper,
    TestChainlinkOracleWrapper__factory,
    TestChainlinkOracle__factory,
    PoolFactory__factory,
    PoolKeeper,
    PoolKeeper__factory,
    PoolSwapLibrary__factory,
    TestToken__factory,
} from "../../typechain"

chai.use(chaiAsPromised)
const { expect } = chai

let quoteToken: string
let oracleWrapper: TestChainlinkOracleWrapper
let oracle: TestChainlinkOracle
let poolKeeper: PoolKeeper

const setupHook = async () => {
    // console.log(123)
    const signers = await ethers.getSigners()
    // Deploy quote token
    const testToken = (await ethers.getContractFactory(
        "TestToken",
        signers[0]
    )) as TestToken__factory
    const token = await testToken.deploy("TEST TOKEN", "TST1")
    // console.log(456)
    await token.deployed()
    await token.mint(10000, signers[0].address)
    quoteToken = token.address
    // console.log(333)

    // Deploy oracle. Using a test oracle for predictability
    const oracleFactory = (await ethers.getContractFactory(
        "TestChainlinkOracle",
        signers[0]
    )) as TestChainlinkOracle__factory
    oracle = await oracleFactory.deploy()
    await oracle.deployed()
    console.log(0)
    const oracleWrapperFactory = (await ethers.getContractFactory(
        "TestOracleWrapper",
        signers[0]
    )) as TestChainlinkOracleWrapper__factory
    console.log(1)
    console.log(oracle.address)
    // console.log(oracleWrapperFactory)
    // console.log(await oracleWrapperFactory.getDeployTransaction)
    oracleWrapper = await oracleWrapperFactory.deploy()
    console.log(2)
    await oracleWrapper.deployed()


    // Deploy pool keeper
    const libraryFactory = (await ethers.getContractFactory(
        "PoolSwapLibrary",
        signers[0]
    )) as PoolSwapLibrary__factory
    console.log(433)
    const library = await libraryFactory.deploy()
    await library.deployed()
    const poolKeeperFactory = (await ethers.getContractFactory("PoolKeeper", {
        signer: signers[0],
    })) as PoolKeeper__factory
    const PoolFactory = (await ethers.getContractFactory("PoolFactory", {
        signer: signers[0],
        libraries: { PoolSwapLibrary: library.address },
    })) as PoolFactory__factory
    // console.log(533)
    const factory = await (await PoolFactory.deploy()).deployed()
    console.log(4)
    poolKeeper = await poolKeeperFactory.deploy(factory.address)
    // console.log(5)
    await poolKeeper.deployed()
    // console.log(6)
    // console.log("setPoolKeeper")
    await factory.connect(signers[0]).setPoolKeeper(poolKeeper.address)
    // console.log(633)

    // Create pool
    await oracleWrapper.increasePrice()
    const deploymentData = {
        owner: generateRandomAddress(),
        poolCode: POOL_CODE,
        frontRunningInterval: 1,
        updateInterval: 2,
        fee: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        leverageAmount: 1,
        feeAddress: generateRandomAddress(),
        quoteToken: quoteToken,
        oracleWrapper: oracleWrapper.address,
    }
    // console.log(999)
    await factory.deployPool(deploymentData)

    const deploymentData2 = {
        owner: generateRandomAddress(),
        poolCode: POOL_CODE_2,
        frontRunningInterval: 1,
        updateInterval: 2,
        fee: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        leverageAmount: 2,
        feeAddress: generateRandomAddress(),
        quoteToken: quoteToken,
        oracleWrapper: oracleWrapper.address,
    }
}
const callData = ethers.utils.defaultAbiCoder.encode(
    [
        ethers.utils.ParamType.from("string[]"),
    ],
    [[POOL_CODE, POOL_CODE_2]]
)
describe("PoolKeeper - checkUpkeep", () => {
    beforeEach(async () => {
        await setupHook()
    })
    it.only("should return true if the trigger condition is met", async () => {
        expect((await poolKeeper.callStatic.checkUpkeep(callData))[0]).to.eq(true)
    })
    it("should return false if the trigger condition isn't met", async () => {
        await poolKeeper.performUpkeep(callData)
        expect((await poolKeeper.callStatic.checkUpkeep(callData))[0]).to.eq(false)
    })
    it("should return the correct perform data to call for upkeep with", async () => {
        // Should be market code [pool codes]
        expect((await poolKeeper.callStatic.checkUpkeep(callData))[1]).to.eq(callData)
    })
    it("should return false if the check data provided is invalid", async () => {
        const falseCallData = ethers.utils.defaultAbiCoder.encode(
            [
                ethers.utils.ParamType.from("uint32"),
                ethers.utils.ParamType.from("string"),
                ethers.utils.ParamType.from("string[]"),
            ],
            [2, MARKET_2, [POOL_CODE, POOL_CODE_2]]
        )
        expect((await poolKeeper.callStatic.checkUpkeep(falseCallData))[0]).to.eq(false)
    })
})
