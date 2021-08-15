import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    ERC20,
    LeveragedPool,
    PoolCommitter,
    PoolSwapLibrary,
    TestToken,
} from "../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { POOL_CODE } from "../constants"
import {
    getEventArgs,
    deployPoolAndTokenContracts,
    getRandomInt,
    generateRandomAddress,
    timeout,
} from "../utilities"

import { BytesLike, ContractReceipt } from "ethers"

chai.use(chaiAsPromised)
const { expect } = chai

const amountCommitted = ethers.utils.parseEther("2000")
const amountMinted = ethers.utils.parseEther("10000")
const feeAddress = generateRandomAddress()
const lastPrice = getRandomInt(99999999, 1)
const updateInterval = 2
const frontRunningInterval = 1
const fee = "0x00000000000000000000000000000000"
const leverage = 1
const commitType = [2] // Long mint;

describe("PoolCommitter.uncommit", () => {
    let signers: SignerWithAddress[]
    let pool: LeveragedPool
    let committer: PoolCommitter
    let token: TestToken
    let library: PoolSwapLibrary
    let longToken: ERC20
    let shortToken: ERC20
    let receipt: ContractReceipt
    let commitID: string

    beforeEach(async () => {
        const elements = await deployPoolAndTokenContracts(
            POOL_CODE,
            frontRunningInterval,
            updateInterval,
            fee,
            leverage,
            feeAddress,
            amountMinted
        )
        signers = elements.signers
        pool = elements.pool
        committer = elements.poolCommiter
        token = elements.token
        longToken = elements.longToken
        shortToken = elements.shortToken
        library = elements.library
        await token.approve(pool.address, ethers.constants.MaxUint256)
        await pool.setKeeper(signers[0].address)
    })

    context(
        "When called with valid commitment ID and by the owner of the specified commitment",
        async () => {
            beforeEach(async () => {
                receipt = await (
                    await committer.commit(commitType, amountCommitted)
                ).wait()
                commitID = getEventArgs(receipt, "CreateCommit")?.commitID
            })
            it("deletes the specified commitment", async () => {
                expect(
                    (await committer.commits(commitID)).amount.eq(
                        ethers.BigNumber.from(amountCommitted)
                    )
                ).to.eq(true)
                await committer.uncommit(commitID)
                expect(
                    (await committer.commits(commitID)).amount.eq(
                        ethers.BigNumber.from(0)
                    )
                ).to.eq(true)
            })

            it("removes the specified commit from storage", async () => {
                await committer.uncommit(commitID)
                expect((await committer.commits(commitID)).owner).to.eq(
                    ethers.constants.AddressZero
                )
                expect((await committer.commits(commitID)).created).to.eq(0)
                expect((await committer.commits(commitID)).amount).to.eq(0)
                expect((await committer.commits(commitID)).commitType).to.eq(0)
            })
            it("emits a `RemoveCommit` event with the correct parameters", async () => {
                const uncommitReceipt = await (
                    await committer.uncommit(commitID)
                ).wait()
                expect(
                    getEventArgs(uncommitReceipt, "RemoveCommit")?.commitID
                ).to.eq(commitID)
                expect(
                    getEventArgs(uncommitReceipt, "RemoveCommit")?.amount
                ).to.eq(getEventArgs(receipt, "CreateCommit")?.amount)
                expect(
                    getEventArgs(uncommitReceipt, "RemoveCommit")?.commitType
                ).to.eq(getEventArgs(receipt, "CreateCommit")?.commitType)
            })
        }
    )

    context("When called with an invalid commitment ID", async () => {
        it("reverts", async () => {
            await expect(
                committer.uncommit(getRandomInt(10, 100))
            ).to.be.rejectedWith(Error)
        })
    })

    context(
        "When called with a valid commitment ID and not by the owner of the specified commitment",
        async () => {
            it("reverts", async () => {
                await expect(
                    committer.connect(signers[1]).uncommit(commitID)
                ).to.be.rejectedWith(Error)
            })
        }
    )

    context("When specified commitment is a long mint", async () => {
        it("updates the shadow long mint balance", async () => {
            const receipt = await (
                await committer.commit([2], amountCommitted)
            ).wait()
            expect(
                (await committer.shadowPools(2)).eq(
                    ethers.BigNumber.from(amountCommitted)
                )
            ).to.eq(true)
            await committer.uncommit(
                getEventArgs(receipt, "CreateCommit")?.commitID
            )
            expect(
                (await committer.shadowPools(2)).eq(ethers.BigNumber.from(0))
            ).to.eq(true)
        })

        it("refunds the user's quote tokens", async () => {
            const receipt = await (
                await committer.commit([0], amountCommitted)
            ).wait()
            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted.sub(amountCommitted)
            )
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)

            await committer.uncommit(
                getEventArgs(receipt, "CreateCommit")?.commitID
            )

            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted
            )
            expect(await token.balanceOf(pool.address)).to.eq(0)
        })
    })

    context("When specified commitment is a short mint", async () => {
        it("updates the shadow short mint balance", async () => {
            const receipt = await (
                await committer.commit([0], amountCommitted)
            ).wait()

            expect(
                (await committer.shadowPools(0)).eq(
                    ethers.BigNumber.from(amountCommitted)
                )
            ).to.eq(true)
            await committer.uncommit(
                getEventArgs(receipt, "CreateCommit")?.commitID
            )
            expect(
                (await committer.shadowPools(0)).eq(ethers.BigNumber.from(0))
            ).to.eq(true)
        })

        it("refunds the user's quote tokens", async () => {
            const receipt = await (
                await committer.commit([2], amountCommitted)
            ).wait()
            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted.sub(amountCommitted)
            )
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)

            await committer.uncommit(
                getEventArgs(receipt, "CreateCommit")?.commitID
            )

            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted
            )
            expect(await token.balanceOf(pool.address)).to.eq(0)
        })
    })

    context("When specified commitment is a long burn", async () => {
        it("updates the shadow long burn balance", async () => {
            const pairToken = await (
                await committer.commit([2], amountCommitted)
            ).wait()
            await timeout(2000)
            await pool.poolUpkeep(1, 2)
            const receipt = await (
                await committer.commit([3], amountCommitted)
            ).wait()

            expect(
                (await committer.shadowPools(3)).eq(
                    ethers.BigNumber.from(amountCommitted)
                )
            ).to.eq(true)
            await committer.uncommit(
                getEventArgs(receipt, "CreateCommit")?.commitID
            )
            expect(
                (await committer.shadowPools(1)).eq(ethers.BigNumber.from(0))
            ).to.eq(true)
        })

        it("does not transfer quote tokens", async () => {
            const pairToken = await (
                await committer.commit([2], amountCommitted)
            ).wait()
            await timeout(2000)
            await pool.poolUpkeep(1, 2)
            const receipt = await (
                await committer.commit([3], amountCommitted)
            ).wait()
            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted.sub(amountCommitted)
            )
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)

            await committer.uncommit(
                getEventArgs(receipt, "CreateCommit")?.commitID
            )

            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted.sub(amountCommitted)
            )
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })

        it("refunds long pair tokens to the user", async () => {
            const pairToken = await (
                await committer.commit([2], amountCommitted)
            ).wait()
            await timeout(2000)
            await pool.poolUpkeep(1, 2)
            const receipt = await (
                await committer.commit([3], amountCommitted)
            ).wait()
            expect(await longToken.balanceOf(signers[0].address)).to.eq(0)
            await committer.uncommit(
                getEventArgs(receipt, "CreateCommit")?.commitID
            )
            expect(await longToken.balanceOf(signers[0].address)).to.eq(
                amountCommitted
            )
        })
    })

    context("When specified commitment is a short burn", async () => {
        it("updates the shadow short burn balance", async () => {
            const pairToken = await (
                await committer.commit([0], amountCommitted)
            ).wait()
            await timeout(2000)
            await pool.poolUpkeep(1, 2)
            const receipt = await (
                await committer.commit([1], amountCommitted)
            ).wait()

            expect(
                (await committer.shadowPools(1)).eq(
                    ethers.BigNumber.from(amountCommitted)
                )
            ).to.eq(true)
            await committer.uncommit(
                getEventArgs(receipt, "CreateCommit")?.commitID
            )
            expect(
                (await committer.shadowPools(1)).eq(ethers.BigNumber.from(0))
            ).to.eq(true)
        })
        it("does not transfer quote tokens", async () => {
            const pairToken = await (
                await committer.commit([0], amountCommitted)
            ).wait()
            await timeout(2000)
            await pool.poolUpkeep(1, 2)
            const receipt = await (
                await committer.commit([1], amountCommitted)
            ).wait()
            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted.sub(amountCommitted)
            )
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)

            await committer.uncommit(
                getEventArgs(receipt, "CreateCommit")?.commitID
            )

            expect(await token.balanceOf(signers[0].address)).to.eq(
                amountMinted.sub(amountCommitted)
            )
            expect(await token.balanceOf(pool.address)).to.eq(amountCommitted)
        })
        it("refunds short pair tokens to the user", async () => {
            const pairToken = await (
                await committer.commit([0], amountCommitted)
            ).wait()
            await timeout(2000)
            await pool.poolUpkeep(1, 2)
            const receipt = await (
                await committer.commit([1], amountCommitted)
            ).wait()
            expect(await shortToken.balanceOf(signers[0].address)).to.eq(0)
            await committer.uncommit(
                getEventArgs(receipt, "CreateCommit")?.commitID
            )
            expect(await shortToken.balanceOf(signers[0].address)).to.eq(
                amountCommitted
            )
        })
    })
})
