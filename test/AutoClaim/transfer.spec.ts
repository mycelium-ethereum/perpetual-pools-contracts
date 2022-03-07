import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
    AutoClaim,
    PoolKeeper,
} from "../../types"

import { POOL_CODE, DEFAULT_FEE } from "../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    CommitEventArgs,
} from "../utilities"
import { BigNumber } from "ethers"
import { TransactionRequest } from "@ethersproject/abstract-provider"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
chai.use(chaiAsPromised)
const { expect } = chai

const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const updateInterval = 200
const frontRunningInterval = 100 // seconds
const fee = DEFAULT_FEE
const leverage = 1

describe("AutoClaim - Ether Transfers", async () => {
    let poolCommitter: PoolCommitter
    let token: TestToken
    let shortToken: ERC20
    let longToken: ERC20
    let pool: LeveragedPool
    let library: PoolSwapLibrary
    let autoClaim: AutoClaim
    let signers: SignerWithAddress[]
    let someUser: SignerWithAddress
    let poolKeeper: PoolKeeper
    const commits: CommitEventArgs[] | undefined = []

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
        library = result.library
        poolCommitter = result.poolCommitter
        autoClaim = result.autoClaim
        signers = result.signers
        someUser = signers[1] /* arbitrary; not signer[0] */
        poolKeeper = result.poolKeeper

        token = result.token
        shortToken = result.shortToken
        longToken = result.longToken

        await token.approve(pool.address, amountMinted)
    })

    context("When Ether is transferred without calldata", async () => {
        it("Reverts", async () => {
            const transferTo: any =
                autoClaim.address /* TODO: should be `Address`, not `any` */
            const transferValue: BigNumber =
                ethers.utils.parseEther("1") /* arbitrary */
            const transferTx: TransactionRequest = {
                to: transferTo,
                from: someUser.address,
                value: transferValue,
            }

            await expect(someUser.sendTransaction(transferTx)).to.be.reverted
        })
    })

    context("When Ether is transferred with calldata", async () => {
        it("Reverts", async () => {
            const transferTo: any =
                autoClaim.address /* TODO: should be `Address`, not `any` */
            const transferValue: BigNumber =
                ethers.utils.parseEther("1") /* arbitrary */
            const transferData: any = "0xcafebeef"
            const transferTx: TransactionRequest = {
                to: transferTo,
                from: someUser.address,
                value: transferValue,
                data: transferData,
            }

            await expect(someUser.sendTransaction(transferTx)).to.be.reverted
        })
    })
})
