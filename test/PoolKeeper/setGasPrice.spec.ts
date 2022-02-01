import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { PoolKeeper, PoolFactory } from "../../types"
import { BigNumberish } from "@ethersproject/bignumber"

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    POOL_CODE,
    DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
    DEFAULT_MIN_COMMIT_SIZE,
} from "../constants"
import { deployPoolSetupContracts, generateRandomAddress } from "../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

let deploymentData: any

describe("PoolKeeper.setGasPrice", () => {
    let poolKeeper: PoolKeeper
    let factory: PoolFactory
    let signers: SignerWithAddress[]
    let owner: SignerWithAddress
    let nonOwner: SignerWithAddress

    beforeEach(async () => {
        // Deploy the contracts
        signers = await ethers.getSigners()
        owner = signers[0]
        nonOwner = signers[1]
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
            quoteToken: token.address,
            oracleWrapper: oracleWrapper.address,
            settlementEthOracle: settlementEthOracle.address,
            minimumCommitSize: DEFAULT_MIN_COMMIT_SIZE,
            maximumCommitQueueLength: DEFAULT_MAX_COMMIT_QUEUE_LENGTH,
        }
    })

    context("When called by the owner", async () => {
        it("Sets the gas price to the input", async () => {
            const newGasPrice: BigNumberish = 500
            await poolKeeper.connect(owner).setGasPrice(newGasPrice)

            expect(await poolKeeper.gasPrice()).to.be.eq(newGasPrice)
        })
    })

    context("When called by a non-owner", async () => {
        it("Reverts", async () => {
            const newGasPrice: BigNumberish = 500

            await expect(
                poolKeeper.connect(nonOwner).setGasPrice(newGasPrice)
            ).to.be.revertedWith("")
        })
    })
})
