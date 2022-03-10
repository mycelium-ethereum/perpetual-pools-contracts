import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
    PoolKeeper,
} from "../../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import {
    DEFAULT_FEE,
    DEFAULT_MINT_AMOUNT,
    LONG_BURN,
    LONG_MINT,
    POOL_CODE,
} from "../../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
    getCurrentTotalCommit,
} from "../../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.BigNumber.from(DEFAULT_MINT_AMOUNT)
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 2

describe("PoolCommitter - Race Condition regression test", () => {
    let token: TestToken

    let longToken: ERC20
    let poolCommitter: PoolCommitter
    let poolKeeper: PoolKeeper
    let pool: LeveragedPool
    let signers: SignerWithAddress[]
    describe("Pool fails to get upkept in time", () => {
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                feeAddress,
                fee
            )
            pool = result.pool
            signers = result.signers
            token = result.token
            longToken = result.longToken
            poolCommitter = result.poolCommitter
            poolKeeper = result.poolKeeper

            await token.approve(pool.address, amountMinted)

            await timeout(updateInterval * 1000)
            console.log("Before upkeep")
            console.log((await poolCommitter.updateIntervalId()).toString())
            console.log(
                (
                    await poolCommitter.getAppropriateUpdateIntervalId()
                ).toString()
            )
            await poolKeeper.performUpkeepSinglePool(pool.address)
            console.log("After upkeep")
            console.log((await poolCommitter.updateIntervalId()).toString())
            console.log(
                (
                    await poolCommitter.getAppropriateUpdateIntervalId()
                ).toString()
            )
            await timeout(updateInterval * 1000)
            console.log("After time increase")
            console.log((await poolCommitter.updateIntervalId()).toString())
            const secondUpdateIntervalId =
                await poolCommitter.getAppropriateUpdateIntervalId()
            console.log(secondUpdateIntervalId.toString())
            await poolCommitter.commit(LONG_MINT, 123, false, false)
            console.log(
                "Commitment upkeep interval: " +
                    (
                        await poolCommitter.userCommitments(
                            signers[0].address,
                            secondUpdateIntervalId
                        )
                    ).updateIntervalId.toString()
            )

            await timeout((updateInterval + 2) * 1000)
            console.log("After second time increase")
            console.log((await poolCommitter.updateIntervalId()).toString())
            const thirdUpdateIntervalId =
                await poolCommitter.getAppropriateUpdateIntervalId()
            console.log(thirdUpdateIntervalId.toString())
        })
        it("should adjust the live long pool balance", async () => {})
    })
})
