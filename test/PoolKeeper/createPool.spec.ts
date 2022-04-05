import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { PoolKeeper, PoolFactory } from "../../types"

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { POOL_CODE } from "../constants"
import { deployPoolSetupContracts, generateRandomAddress } from "../utilities"

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
        const setup = await deployPoolSetupContracts()
        const token = setup.token
        const oracleWrapper = setup.oracleWrapper
        const settlementEthOracle = setup.settlementEthOracle
        poolKeeper = setup.poolKeeper
        factory = setup.factory

        deploymentData = {
            owner: signers[0].address,
            keeper: poolKeeper.address,
            poolName: POOL_CODE,
            frontRunningInterval: 3,
            updateInterval: 5,
            leverageAmount: 5,
            feeAddress: generateRandomAddress(),
            settlementToken: token.address,
            oracleWrapper: oracleWrapper.address,
            settlementEthOracle: settlementEthOracle.address,
            feeController: signers[0].address,
            mintingFee: 0,
            burningFee: 0,
            changeInterval: 0,
        }
    })

    it("should Revert if leverageAmount == 0", async () => {
        deploymentData.leverageAmount = 0
        await expect(factory.deployPool(deploymentData)).to.be.revertedWith(
            "Leveraged amount cannot equal 0"
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
        expect(await factory.deployPool(deploymentData)).to.emit(
            factory,
            "DeployPool"
        )
    })
})
