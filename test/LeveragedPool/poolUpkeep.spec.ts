import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    TestToken,
    ERC20,
    PoolSwapLibrary,
    PoolCommitter,
    PriceChanger,
} from "../../typechain"

import { POOL_CODE, NO_COMMITS_REMAINING } from "../constants"
import {
    deployPoolAndTokenContracts,
    getRandomInt,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
} from "../utilities"
import { BytesLike } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const lastPrice = getRandomInt(99999999, 1)
const updateInterval = 2
const frontRunningInterval = 1 // seconds
const fee = "0x00000000000000000000000000000000"
const leverage = 1

describe("LeveragedPool - executeAllCommitments", () => {
    let priceChanger: PriceChanger
    let poolCommiter: PoolCommitter
    let token: TestToken
    let shortToken: ERC20
    let longToken: ERC20
    let pool: LeveragedPool
    let library: PoolSwapLibrary

    const commits: CommitEventArgs[] | undefined = []
    beforeEach(async () => {
        const result = await deployPoolAndTokenContracts(
            POOL_CODE,
            frontRunningInterval,
            updateInterval,
            fee,
            leverage,
            feeAddress,
            amountMinted
        )
        pool = result.pool
        library = result.library
        poolCommiter = result.poolCommiter
        priceChanger = result.priceChanger

        token = result.token
        shortToken = result.shortToken
        longToken = result.longToken

        await token.approve(pool.address, amountMinted)

        // Long mint commit
        await createCommit(poolCommiter, [2], amountCommitted)
        await createCommit(poolCommiter, [0], amountCommitted)

        await shortToken.approve(pool.address, amountMinted)
        await longToken.approve(pool.address, await longToken.totalSupply())
        await timeout(2000)
        const signers = await ethers.getSigners()
        await pool.setKeeper(signers[0].address)
        await pool.poolUpkeep(lastPrice, lastPrice)

        // End state: `amountCommitted` worth of Long token minted. Price = lastPrice + 10
    })

    describe("With one Long Mint and one Long Burn and normal price change", async () => {
        it.only("Updates state", async () => {
            // Long mint commit
            await createCommit(poolCommiter, [2], amountCommitted)
            // Long burn commit
            await createCommit(poolCommiter, [3], amountCommitted.div(2))
            await timeout(2000)

            const shortTokenTotalSupplyBefore = await shortToken.totalSupply()
            const longTokenTotalSupplyBefore = await longToken.totalSupply()
            const longBalanceBefore = await pool.longBalance()
            const shortBalanceBefore = await pool.shortBalance()
            /*
            - earliestCommitUnexecuted
            - tokens[0] and [1] do not change totalSupply
            - shortBalance and longBalance do not change
            - balance of leveragedpool does not change
            */
            // Double the price
            await pool.poolUpkeep(lastPrice + 10, 2 * (lastPrice + 10));

            const shortTokenTotalSupplyAfter = await shortToken.totalSupply()
            const longTokenTotalSupplyAfter = await longToken.totalSupply()
            const expectedLongTokenDifference = ethers.utils.parseEther("2000")

            // Should be equal since the commits are long commits
            expect(shortTokenTotalSupplyAfter).to.equal(shortTokenTotalSupplyBefore)
            expect(longTokenTotalSupplyAfter).to.equal(longTokenTotalSupplyBefore.add(expectedLongTokenDifference))

            const longBalanceAfter = await pool.longBalance()
            const shortBalanceAfter = await pool.shortBalance()
            expect(longBalanceAfter).to.equal(longBalanceBefore.add(shortBalanceBefore.div(2)))
            console.log(ethers.utils.formatEther(shortBalanceBefore))
            console.log(ethers.utils.formatEther(shortBalanceAfter))
            console.log(ethers.utils.formatEther(longBalanceBefore))
            console.log(ethers.utils.formatEther(longBalanceAfter))
            expect(shortBalanceAfter).to.equal(shortBalanceBefore.div(2))

            const earliestCommitUnexecuted = await poolCommiter.earliestCommitUnexecuted()
            expect(earliestCommitUnexecuted).to.equal(NO_COMMITS_REMAINING)
        })
    })
    /*
    describe("Short mint->short burn", () => {
        const commits: CommitEventArgs[] | undefined = []
        beforeEach(async () => {
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                fee,
                leverage,
                feeAddress,
                amountMinted
            )
            pool = result.pool
            library = result.library

            token = result.token
            shortToken = result.shortToken
            await pool.setKeeper(result.signers[0].address)

            await token.approve(pool.address, amountMinted)

            const commit = await createCommit(pool, [0], amountCommitted)

            await shortToken.approve(pool.address, amountMinted)
            await timeout(2000)

            await pool.executePriceChange(lastPrice, 10)
            await pool.executeCommitment([commit.commitID])

            commits.push(await createCommit(pool, [0], amountCommitted))
            commits.push(await createCommit(pool, [1], amountCommitted.div(2)))
        })
        it("should reduce the balances of the shadows pools involved", async () => {
            // Short mint and burn pools
            expect(await pool.shadowPools(commits[0].commitType)).to.eq(
                amountCommitted
            )
            expect(await pool.shadowPools(commits[1].commitType)).to.eq(
                amountCommitted.div(2)
            )
            await timeout(2000)
            await pool.executePriceChange(lastPrice, 10)
            await pool.executeCommitment([
                commits[0].commitID,
                commits[1].commitID,
            ])

            expect(await pool.shadowPools(commits[0].commitType)).to.eq(0)
            expect(await pool.shadowPools(commits[1].commitType)).to.eq(0)
        })
        it("should adjust the balances of the live pools involved", async () => {
            expect(await pool.shortBalance()).to.eq(amountCommitted)
            await timeout(2000)
            await pool.executePriceChange(lastPrice, 10)

            await pool.executeCommitment([
                commits[0].commitID,
                commits[1].commitID,
            ])

            expect(await pool.shortBalance()).to.eq(
                amountCommitted.add(amountCommitted.div(2))
            )
        })
    })
    */
})
