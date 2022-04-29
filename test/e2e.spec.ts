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
    TestChainlinkOracle,
    L2Encoder,
} from "../types"

import {
    POOL_CODE,
    SHORT_BURN,
    LONG_BURN,
    LONG_MINT,
    SHORT_MINT,
} from "./constants"
import {
    deployPoolAndTokenContracts,
    getRandomInt,
    createCommit,
    timeout,
} from "./utilities"
import { BigNumber } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const lastPrice = ethers.utils.parseEther(getRandomInt(99999999, 1).toString())
const updateInterval = 200
const frontRunningInterval = 20 // seconds
const fee = "0" // ethers.utils.parseEther("0.00001")
const leverage = 1

describe("LeveragedPool - executeAllCommitments", () => {
    let poolCommitter: PoolCommitter
    let token: TestToken
    let shortToken: ERC20
    let longToken: ERC20
    let pool: LeveragedPool
    let library: PoolSwapLibrary
    let poolKeeper: PoolKeeper
    let chainlinkOracle: TestChainlinkOracle
    let l2Encoder: L2Encoder

    describe("e2e", async () => {
        it("Operates normally", async () => {
            const signers: SignerWithAddress[] = await ethers.getSigners()
            const result = await deployPoolAndTokenContracts(
                POOL_CODE,
                frontRunningInterval,
                updateInterval,
                leverage,
                signers[0].address,
                fee
            )
            pool = result.pool
            library = result.library
            poolCommitter = result.poolCommitter
            poolKeeper = result.poolKeeper
            chainlinkOracle = result.chainlinkOracle
            l2Encoder = result.l2Encoder

            token = result.token
            await token.setDecimals(8)
            shortToken = result.shortToken
            longToken = result.longToken

            await token.approve(pool.address, amountMinted)
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            await timeout(updateInterval * 1000)
            await pool.setKeeper(signers[0].address)
            await expect(
                pool.connect(signers[1]).poolUpkeep(9, 10)
            ).to.be.reverted
            // Doesn't delete commit
            const updateIntervalId = await poolCommitter.updateIntervalId()
            expect(
                (await poolCommitter.totalPoolCommitments(updateIntervalId))
                    .longMintSettlement
            ).to.eq(amountCommitted)
            await pool.poolUpkeep(lastPrice, lastPrice)

            // Long mint commit
            await createCommit(
                l2Encoder,
                poolCommitter,
                LONG_MINT,
                amountCommitted
            )
            // Short mint commit
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_MINT,
                amountCommitted
            )

            await shortToken.approve(pool.address, amountMinted)
            await longToken.approve(pool.address, await longToken.totalSupply())

            const longTokenSupplyBefore = await longToken.totalSupply()
            const shortTokenSupplyBefore = await shortToken.totalSupply()

            // Not enough time passed
            await pool.setKeeper(poolKeeper.address)
            await poolKeeper.performUpkeepSinglePool(pool.address)

            expect(await longToken.balanceOf(signers[0].address)).to.equal(0)
            expect(await shortToken.balanceOf(signers[0].address)).to.equal(0)

            const longTokenSupplyAfter = await longToken.totalSupply()
            const shortTokenSupplyAfter = await shortToken.totalSupply()

            expect(longTokenSupplyAfter).to.equal(longTokenSupplyBefore)
            expect(shortTokenSupplyAfter).to.equal(shortTokenSupplyBefore)

            await timeout(updateInterval * 1000)

            await poolKeeper.performUpkeepSinglePool(pool.address)

            // Claim, then balance should go to account

            await poolCommitter.claim(signers[0].address)
            expect(await longToken.balanceOf(signers[0].address)).to.equal(
                amountCommitted.mul(2)
            )
            expect(await shortToken.balanceOf(signers[0].address)).to.equal(
                amountCommitted
            )

            const longTokenSupplyAfterSecond = await longToken.totalSupply()
            const shortTokenSupplyAfterSecond = await shortToken.totalSupply()

            // Each side's token should increase
            // and long should equal amountCommitted * 2 (since 2x commits were made),
            // while short supply is amountCommitted (since 1x short mint commits was made)
            expect(longTokenSupplyAfterSecond).to.be.gt(longTokenSupplyAfter)
            expect(shortTokenSupplyAfterSecond).to.be.gt(shortTokenSupplyAfter)
            expect(longTokenSupplyAfterSecond).to.equal(amountCommitted.mul(2))
            expect(shortTokenSupplyAfterSecond).to.equal(amountCommitted)

            const longBalanceBefore = await pool.longBalance()
            const shortBalanceBefore = await pool.shortBalance()

            // Halve price
            const currentPrice = (await chainlinkOracle.latestRoundData())[1]
            await chainlinkOracle.setPrice(currentPrice.div(2))

            const tenToTheTen = ethers.BigNumber.from("10").pow("10")
            const upkeepInformation = await pool.getUpkeepInformation()
            // Multiply currentPrice/2 by 10^10 because that's what the oracle wrapper does
            expect(upkeepInformation[0]).to.equal(
                currentPrice.div(2).mul(tenToTheTen)
            )
            expect(upkeepInformation[3]).to.equal(updateInterval)
            // There aren't really any other ways to programatically figure out the last price timestamp
            // other than just calling it directly, so this isn't really testing anything since it's
            // basically the same function
            const lastPriceTimestamp = await pool.lastPriceTimestamp()
            expect(upkeepInformation[2]).to.equal(lastPriceTimestamp)

            // Perform upkeep
            await timeout(updateInterval * 1000)
            const receipt1 = await (
                await poolKeeper.performUpkeepSinglePool(pool.address)
            ).wait()

            // Short balance should increase, long should half
            const longBalanceAfter = await pool.longBalance()
            const shortBalanceAfter = await pool.shortBalance()

            const tenGwei = BigNumber.from("10").pow(9).mul(10)
            const tenToTheEighteen = BigNumber.from("10").pow(18)
            const settlementPerEth = BigNumber.from("3000").mul(
                BigNumber.from(10).pow(8)
            )

            const approxFirstUpkeepGasCost = receipt1.gasUsed
                .mul(tenGwei)
                .mul(settlementPerEth)
                .div(tenToTheEighteen)

            const sideTokenEpsilon = ethers.utils.parseEther("0.0000001")
            const lowerBoundLongBalance: any = longBalanceBefore
                .div(2)
                .sub(approxFirstUpkeepGasCost)
                .sub(sideTokenEpsilon)
            const upperBoundLongBalance: any = longBalanceBefore
                .div(2)
                .sub(approxFirstUpkeepGasCost)
                .add(sideTokenEpsilon)
            const lowerBoundShortBalance: any = shortBalanceBefore
                .add(longBalanceBefore.div(2))
                .sub(approxFirstUpkeepGasCost)
                .sub(sideTokenEpsilon)
            const upperBoundShortBalance: any = shortBalanceBefore
                .add(longBalanceBefore.div(2))
                .sub(approxFirstUpkeepGasCost)
                .add(sideTokenEpsilon)

            expect(longBalanceAfter).to.be.lt(longBalanceBefore)
            expect(shortBalanceAfter).to.be.gt(shortBalanceBefore)

            // Short burn
            await createCommit(
                l2Encoder,
                poolCommitter,
                SHORT_BURN,
                amountCommitted
            )
            // Short tokens should be decreased by amountCommitted, to 0
            expect(await shortToken.totalSupply()).to.equal(0)

            // Inside the frontRunningInterval, so uncommit will revert
            await timeout((updateInterval - frontRunningInterval / 2) * 1000)
            await timeout(updateInterval * 1000)

            const committerBalanceBefore = await token.balanceOf(
                signers[0].address
            )
            const keeperBalanceBefore = await token.balanceOf(
                signers[1].address
            )

            const receipt = await (
                await poolKeeper
                    .connect(signers[1])
                    .performUpkeepSinglePool(pool.address)
            ).wait()

            const keeperBalanceAfter = await token.balanceOf(signers[1].address)
            await poolCommitter.claim(signers[0].address)
            const committerBalanceAfter = await token.balanceOf(
                signers[0].address
            )

            // Calculate the keeper reward as gas used * gas price * ETH price (in settlement tokens)
            const estimatedKeeperReward = receipt.gasUsed
                .mul(tenGwei)
                .mul(settlementPerEth)
                .div(tenToTheEighteen)

            const keeperLowerBound: any = estimatedKeeperReward.sub(
                estimatedKeeperReward.div(3)
            )
            const keeperUpperBound: any = estimatedKeeperReward.add(
                estimatedKeeperReward.div(3)
            )
            // Keeper balance should change by estimated keeper reward (approximately)
            expect(keeperBalanceAfter.sub(keeperBalanceBefore)).to.be.gt(
                keeperBalanceBefore
            )

            const epsilon = "1000000000"
            // The committer should get amountCommitted * 2 back (price doubled), minus the amount taken by keeper
            // Very rough estimate and doesn't take into account multiple upkeeps and their proportions taken from short side
            const expectedBalanceAfter = committerBalanceBefore
                .add(amountCommitted.mul(2))
                .sub(keeperBalanceAfter.sub(keeperBalanceBefore))
            const lowerBound: any = expectedBalanceAfter.sub(epsilon)
            const upperBound: any = expectedBalanceAfter.add(epsilon)
            expect(committerBalanceAfter).to.be.gt(committerBalanceBefore)

            const longTokens = await longToken.balanceOf(signers[0].address)
            // LONG BURN (undo all the long mints)
            await createCommit(l2Encoder, poolCommitter, LONG_BURN, longTokens)
            const longTokensAfter = await longToken.balanceOf(
                signers[0].address
            )
            expect(longTokensAfter).to.equal(0)
        })
    })
})
