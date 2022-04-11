import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { BigNumber, BigNumberish } from "ethers"
import {
    LeveragedPool,
    TestToken,
    PoolCommitter,
    AutoClaim,
    PoolKeeper,
    L2Encoder,
} from "../../types"

import { POOL_CODE, DEFAULT_FEE, LONG_MINT } from "../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    createCommit,
    timeout,
} from "../utilities"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 1
const reward = 123123

describe("AutoClaim - checkClaim", () => {
    let poolCommitter: PoolCommitter
    let token: TestToken
    let pool: LeveragedPool
    let autoClaim: AutoClaim
    let signers: SignerWithAddress[]
    let poolKeeper: PoolKeeper
    let l2Encoder: L2Encoder

    beforeEach(async () => {
        const result = await deployPoolAndTokenContracts(
            POOL_CODE,
            frontRunningInterval,
            updateInterval,
            leverage,
            feeAddress,
            fee
        )
        l2Encoder = result.l2Encoder
        pool = result.pool
        poolCommitter = result.poolCommitter
        autoClaim = result.autoClaim
        signers = result.signers
        poolKeeper = result.poolKeeper

        token = result.token
        await token.approve(pool.address, amountMinted)
    })

    context(
        "When called with executable claim and correct update interval ID",
        async () => {
            it("Returns true", async () => {
                const one: BigNumber = ethers.BigNumber.from(1)

                const someUpdateIntervalId: BigNumber = one
                const someReward: BigNumberish = 100
                const executableClaim = {
                    updateIntervalId: someUpdateIntervalId,
                    reward: someReward,
                }
                const currentUpdateIntervalId: BigNumber =
                    someUpdateIntervalId.add(one)

                const actualResult: boolean = await autoClaim.checkClaim(
                    executableClaim,
                    currentUpdateIntervalId
                )

                const expectedResult: boolean = true

                await expect(actualResult).to.eq(expectedResult)
            })
        }
    )

    context(
        "When called with nonexecutable claim with future update interval ID and correct update interval ID",
        async () => {
            it("Returns false", async () => {
                const one: BigNumber = ethers.BigNumber.from(1)
                const ten: BigNumber = ethers.BigNumber.from(10)

                const someUpdateIntervalId: BigNumber = ten
                const someReward: BigNumberish = 100
                const executableClaim = {
                    updateIntervalId: someUpdateIntervalId,
                    reward: someReward,
                }
                const currentUpdateIntervalId: BigNumber = one

                const actualResult: boolean = await autoClaim.checkClaim(
                    executableClaim,
                    currentUpdateIntervalId
                )

                const expectedResult: boolean = false

                await expect(actualResult).to.eq(expectedResult)
            })
        }
    )

    context(
        "When called with nonexecutable claim with zero update interval ID and correct update interval ID",
        async () => {
            it("Returns false", async () => {
                const one: BigNumber = ethers.BigNumber.from(1)

                const someUpdateIntervalId: BigNumberish = 0
                const someReward: BigNumberish = 100
                const executableClaim = {
                    updateIntervalId: someUpdateIntervalId,
                    reward: someReward,
                }
                const currentUpdateIntervalId: BigNumber = one

                const actualResult: boolean = await autoClaim.checkClaim(
                    executableClaim,
                    currentUpdateIntervalId
                )

                const expectedResult: boolean = false

                await expect(actualResult).to.eq(expectedResult)
            })
        }
    )
})
