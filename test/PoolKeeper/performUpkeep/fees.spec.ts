import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    createCommit,
    deployPoolAndTokenContracts,
    deployPoolSetupContracts,
    timeout,
} from "../../utilities"

import { DEFAULT_MINT_AMOUNT, POOL_CODE, GAS_OVERHEAD } from "../../constants"
import {
    PoolKeeper,
    ChainlinkOracleWrapper,
    TestToken,
    TestChainlinkOracle,
    PoolCommitter,
} from "../../../types"
import { BigNumber } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

let derivativeChainlinkOracle: TestChainlinkOracle
let derivativeOracleWrapper: ChainlinkOracleWrapper
let poolKeeper: PoolKeeper
let pool: any
let poolCommitter: PoolCommitter
let POOL1_ADDR: string
let signers: SignerWithAddress[]
let token: TestToken

const updateInterval = 10
const frontRunningInterval = 1
const fee = ethers.utils.parseEther("0.05")
const mintAmount = DEFAULT_MINT_AMOUNT

const setupHook = async () => {
    signers = await ethers.getSigners()
    /* NOTE: settlementToken in this test is the same as the derivative oracle */
    const contracts1 = await deployPoolAndTokenContracts(
        POOL_CODE,
        frontRunningInterval,
        updateInterval,
        1,
        signers[0].address,
        fee
    )
    poolCommitter = contracts1.poolCommitter
    token = contracts1.token
    pool = contracts1.pool
    poolKeeper = contracts1.poolKeeper
    derivativeChainlinkOracle = contracts1.chainlinkOracle
    derivativeOracleWrapper = contracts1.oracleWrapper
    await token.approve(pool.address, mintAmount)
    await timeout(updateInterval * 1000 * 2)
    await pool.setKeeper(signers[0].address)
    await pool.poolUpkeep(9, 10)
    POOL1_ADDR = pool.address
}

interface Upkeep {
    cumulativePrice: BigNumber
    lastSamplePrice: BigNumber
    executionPrice: BigNumber
    lastExecutionPrice: BigNumber
    count: number
    updateInterval: number
    roundStart: number
}
describe("Leveraged pool fees", () => {
    it("Should revert if fee above 10%", async () => {
        const setupContracts = await deployPoolSetupContracts()

        await expect(
            setupContracts.factory.setFee(ethers.utils.parseEther("100"))
        ).to.be.revertedWith("Fee cannot be > 10%")
    })

    it("Should revert if fee above 10%", async () => {
        const setupContracts = await deployPoolSetupContracts()

        await expect(
            setupContracts.factory.setFee(ethers.utils.parseEther("100"))
        ).to.be.revertedWith("Fee cannot be > 10%")
    })

    describe("Fees on price change", () => {
        let lastTime: BigNumber

        before(async () => {
            await setupHook()
            // process a few upkeeps
            lastTime = await pool.lastPriceTimestamp()
            await timeout(updateInterval * 1000 + 1000)
            await pool.setKeeper(poolKeeper.address)
        })

        it("Takes the right fee amount", async () => {
            await createCommit(poolCommitter, [2], mintAmount.div(2))
            await createCommit(poolCommitter, [0], mintAmount.div(2))
            await timeout(updateInterval * 1000 + 1000)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            await timeout(updateInterval * 1000 + 1000)
            // We are OK with small amounts of dust being left in the contract because
            // over-settlementised pools are OK
            const approxKeeperFee = mintAmount.div(2).add(GAS_OVERHEAD)

            let balanceBefore = await token.balanceOf(signers[0].address)
            await poolKeeper.performUpkeepSinglePool(pool.address)
            let balanceAfter = await token.balanceOf(signers[0].address)
            let feesTaken = balanceAfter.sub(balanceBefore)

            const epsilon = approxKeeperFee.mul(
                ethers.utils.parseEther("0.0000000000000001")
            )
            const upperBound = approxKeeperFee.add(epsilon)
            const lowerBound = approxKeeperFee.sub(epsilon)
            //@ts-ignore
            expect(feesTaken).to.be.within(lowerBound, upperBound)
        })
    })
})
