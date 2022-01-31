import { ethers, network } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    deployPoolAndTokenContracts,
    deployPoolSetupContracts,
    incrementPrice,
} from "../utilities"

import {
    DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
    DEFAULT_MIN_COMMIT_SIZE,
    POOL_CODE,
} from "../constants"
import {
    TestChainlinkOracle,
    ChainlinkOracleWrapper,
    PoolKeeper,
    TestToken,
    LeveragedPool,
} from "../../types"

chai.use(chaiAsPromised)
const { expect } = chai

let signers: any
let quoteToken: string
let oracleWrapper: ChainlinkOracleWrapper
let settlementEthOracle: ChainlinkOracleWrapper
let poolKeeper: PoolKeeper
let token: TestToken
let pool1: LeveragedPool

const forwardTime = async (seconds: number) => {
    await network.provider.send("evm_increaseTime", [seconds])
    await network.provider.send("evm_mine", [])
}

const setupHook = async () => {
    signers = await ethers.getSigners()
    const setup = await deployPoolSetupContracts()
    quoteToken = setup.token.address
    oracleWrapper = setup.oracleWrapper
    settlementEthOracle = setup.settlementEthOracle
    /* NOTE: settlementToken in this test is the same as the derivative oracle */
    const deploymentData = {
        poolName: POOL_CODE,
        frontRunningInterval: 1,
        updateInterval: 2,
        leverageAmount: 1,
        quoteToken: quoteToken,
        oracleWrapper: oracleWrapper.address,
        settlementEthOracle: settlementEthOracle.address,
    }

    const contracts1 = await deployPoolAndTokenContracts(
        POOL_CODE,
        deploymentData.frontRunningInterval,
        deploymentData.updateInterval,
        1,
        DEFAULT_MIN_COMMIT_SIZE,
        DEFAULT_MAX_COMMIT_QUEUE_LENGTH
    )

    token = contracts1.token
    signers = await ethers.getSigners()
    poolKeeper = contracts1.poolKeeper
    oracleWrapper = contracts1.oracleWrapper
    pool1 = contracts1.pool
}
describe("PoolKeeper - checkUpkeepSinglePool", () => {
    beforeEach(async () => {
        await setupHook()
    })

    context("when trigger condition is met", async () => {
        it("returns true", async () => {
            await forwardTime(5)

            /* induce price increase */
            const underlyingOracle: TestChainlinkOracle =
                (await ethers.getContractAt(
                    "TestChainlinkOracle",
                    await oracleWrapper.oracle()
                )) as TestChainlinkOracle
            await incrementPrice(underlyingOracle)

            const poolAddress = pool1.address
            expect(await poolKeeper.checkUpkeepSinglePool(poolAddress)).to.eq(
                true
            )
        })
    })

    context("when trigger condition is not met", async () => {
        it("returns false", async () => {
            await forwardTime(5)

            /* induce price increase */
            const underlyingOracle: TestChainlinkOracle =
                (await ethers.getContractAt(
                    "TestChainlinkOracle",
                    await oracleWrapper.oracle()
                )) as TestChainlinkOracle
            await incrementPrice(underlyingOracle)

            const poolAddress = pool1.address
            await poolKeeper.performUpkeepSinglePool(poolAddress)
            expect(await poolKeeper.checkUpkeepSinglePool(poolAddress)).to.eq(
                false
            )
        })
    })
})
