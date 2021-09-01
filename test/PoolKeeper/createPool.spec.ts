import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    PoolKeeper__factory,
    PoolKeeper,
    PoolSwapLibrary__factory,
    PoolFactory__factory,
    ChainlinkOracleWrapper__factory,
    TestChainlinkOracle__factory,
    ChainlinkOracleWrapper,
    PoolFactory,
    PoolCommitterDeployer__factory,
    TestToken__factory,
    TestChainlinkOracle,
} from "../../types"

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { OPERATOR_ROLE, ADMIN_ROLE, POOL_CODE, MARKET_CODE, DEFAULT_MAX_COMMIT_QUEUE_LENGTH, DEFAULT_MIN_COMMIT_SIZE } from "../constants"
import { deployPoolSetupContracts, generateRandomAddress } from "../utilities"
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
        signers = await ethers.getSigners()
        const setup = await deployPoolSetupContracts()
        const token = setup.token
        const oracleWrapper = setup.oracleWrapper
        const settlementEthOracle = setup.settlementEthOracle
        poolKeeper = setup.poolKeeper
        factory = setup.factory

        const minimumCommitSize = DEFAULT_MIN_COMMIT_SIZE
        const maximumCommitQueueLength = DEFAULT_MAX_COMMIT_QUEUE_LENGTH

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
            settlementEthOracle: settlementEthOracle.address,
            minimumCommitSize: minimumCommitSize,
            maximumCommitQueueLength: maximumCommitQueueLength
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
