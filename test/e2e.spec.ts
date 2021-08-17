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
    ChainlinkOracleWrapper,
    TestChainlinkOracle,
} from "../typechain"

import { POOL_CODE, NO_COMMITS_REMAINING } from "./constants"
import {
    deployPoolAndTokenContracts,
    getRandomInt,
    generateRandomAddress,
    createCommit,
    CommitEventArgs,
    timeout,
} from "./utilities"
import { BigNumber, BytesLike } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const lastPrice = ethers.utils.parseEther(getRandomInt(99999999, 1).toString())
const updateInterval = 20
const frontRunningInterval = 10 // seconds
const fee = "0x00000000000000000000000000000000"
const leverage = 1

describe("LeveragedPool - executeAllCommitments", () => {
    let poolCommiter: PoolCommitter
    let token: TestToken
    let shortToken: ERC20
    let longToken: ERC20
    let pool: LeveragedPool
    let library: PoolSwapLibrary
    let poolKeeper: PoolKeeper
    let derivativeOracle: TestChainlinkOracle

    const commits: CommitEventArgs[] | undefined = []

    describe("e2e", async () => {
        it.only("Operates normally", async () => {
			const signers:SignerWithAddress[] = await ethers.getSigners()
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
            poolKeeper = result.poolKeeper
            derivativeOracle = result.derivativeOracle

			token = result.token
			shortToken = result.shortToken
			longToken = result.longToken

			await token.approve(pool.address, amountMinted)
            await timeout(updateInterval * 1000)
			const commitType = [2] //long mint;
            const commit = await createCommit(
                poolCommiter,
                commitType,
                amountCommitted
            )
            await pool.setKeeper(signers[0].address)
            await expect(
                pool.connect(signers[1]).poolUpkeep(9, 10)
            ).to.be.revertedWith("msg.sender not keeper")
            // Doesn't delete commit
            expect((await poolCommiter.commits(commit.commitID)).amount).to.eq(
                amountCommitted
            )
			await pool.poolUpkeep(lastPrice, lastPrice)

			// Long mint commit
			await createCommit(poolCommiter, [2], amountCommitted)
			// Short mint commit
			await createCommit(poolCommiter, [0], amountCommitted)

			await shortToken.approve(pool.address, amountMinted)
            await longToken.approve(pool.address, await longToken.totalSupply())

            const longTokenSupplyBefore = await longToken.totalSupply()
            const shortTokenSupplyBefore = await shortToken.totalSupply()

			// Not enough time passed
            await pool.setKeeper(poolKeeper.address)
			await poolKeeper.performUpkeepSinglePool(pool.address)

            const longTokenSupplyAfter = await longToken.totalSupply()
            const shortTokenSupplyAfter = await shortToken.totalSupply()

            expect(longTokenSupplyAfter).to.equal(longTokenSupplyBefore)
            expect(shortTokenSupplyAfter).to.equal(shortTokenSupplyBefore)

            await timeout(updateInterval * 1000)

			await poolKeeper.performUpkeepSinglePool(pool.address)

            const longTokenSupplyAfterSecond = await longToken.totalSupply()
            const shortTokenSupplyAfterSecond = await shortToken.totalSupply()

            expect(longTokenSupplyAfterSecond).to.be.gt(longTokenSupplyAfter)
            expect(shortTokenSupplyAfterSecond).to.be.gt(shortTokenSupplyAfter)
		})
    })
})
