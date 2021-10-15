import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { PriceObserver__factory, PriceObserver } from "../types"

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber, BigNumberish } from "ethers"

chai.use(chaiAsPromised)
const { expect } = chai

describe("PriceObserver", async () => {
    let priceObserver: PriceObserver
    let signers: SignerWithAddress[]
    let owner: SignerWithAddress
    let nonOwner: SignerWithAddress
    const capacity: BigNumberish = 24

    before(async () => {
        /* retrieve signers */
        signers = await ethers.getSigners()
        owner = signers[0]
        nonOwner = signers[1]

        /* deploy price observer contract */
        const priceObserverFactory = (await ethers.getContractFactory(
            "PriceObserver",
            owner
        )) as PriceObserver__factory
        priceObserver = await priceObserverFactory.deploy()
    })

    describe("capacity", async () => {
        context("When called", async () => {
            it("Returns the correct capacity", async () => {
                expect(await priceObserver.capacity()).to.be.eq(capacity)
            })
        })
    })

    describe("clear", async () => {
        context("When called", async () => {
            it("Sets the length of the observations array to zero", async () => {
                await priceObserver.clear()

                expect(await priceObserver.length()).to.be.eq(0)
            })
        })
    })

    describe("get", async () => {
        context(
            "When called with an index greater than the length of the observations array",
            async () => {
                it("Reverts", async () => {
                    let index: BigNumber = (await priceObserver.length()).add(
                        ethers.BigNumber.from(1)
                    )

                    await expect(priceObserver.get(index)).to.be.revertedWith(
                        "PO: Out of bounds"
                    )
                })
            }
        )

        context(
            "When called with an index equal to the length of the observations array",
            async () => {
                it("Reverts", async () => {
                    let index: BigNumber = await priceObserver.length()

                    await expect(priceObserver.get(index)).to.be.revertedWith(
                        "PO: Out of bounds"
                    )
                })
            }
        )
    })

    describe("add", async () => {
        context(
            "When called with an observations array less than capacity",
            async () => {
                it("Updates the observations array at the next free slot", async () => {
                    const newValue: BigNumberish = 12
                    const previousLength: BigNumber =
                        await priceObserver.length()

                    await priceObserver.add(newValue)

                    expect(await priceObserver.get(previousLength)).to.be.eq(
                        newValue
                    )
                })

                it("Increments the length of the observations array by one", async () => {
                    const newValue: BigNumberish = 12
                    const previousLength: BigNumber =
                        await priceObserver.length()

                    await priceObserver.add(newValue)

                    expect(await priceObserver.length()).to.be.eq(
                        previousLength.add(ethers.constants.One)
                    )
                })
            }
        )

        context("When called with a full observations array", async () => {
            before(async () => {
                /* arbitrary values, but must have length of capacity */
                const prices: BigNumberish[] = [
                    2, 3, 4, 3, 7, 8, 12, 10, 11, 12, 14, 5, 5, 9, 10, 1, 1, 0,
                    2, 2, 3, 4, 6, 10,
                ]

                /* populate observations array */
                prices.forEach(async (x) => await priceObserver.add(x))
            })

            it("Updates the observations array at the last slot", async () => {
                const newValue: BigNumberish = 12
                const lastPosition: BigNumber = (
                    await priceObserver.length()
                ).sub(ethers.constants.One)

                await priceObserver.add(newValue)

                expect(await priceObserver.get(lastPosition)).to.be.eq(newValue)
            })

            it("Does not modify the length of the observations array", async () => {
                const newValue: BigNumberish = 12
                const previousLength: BigNumber = await priceObserver.length()

                await priceObserver.add(newValue)

                expect(await priceObserver.length()).to.be.eq(previousLength)
            })

            it("Rotates the observations array", async () => {
                const newValue: BigNumberish = 12
                const expectedPrices: BigNumber[] = [
                    3,
                    4,
                    3,
                    7,
                    8,
                    12,
                    10,
                    11,
                    12,
                    14,
                    5,
                    5,
                    9,
                    10,
                    1,
                    1,
                    0,
                    2,
                    2,
                    3,
                    4,
                    6,
                    10,
                    newValue,
                ].map((x) => ethers.BigNumber.from(x))

                await priceObserver.add(newValue)

                expect(await priceObserver.getAll()).to.be.eq(expectedPrices)
            })
        })
    })

    describe("getAll", async () => {
        context("When called", async () => {
            before(async () => {
                /* arbitrary values, length less than or equal to capacity */
                const prices: BigNumberish[] = [
                    2, 3, 4, 3, 7, 8, 12, 10, 11, 12, 14, 5, 5, 9, 10, 1, 1, 0,
                    2, 2, 3, 4, 6, 10,
                ].map((x) => ethers.BigNumber.from(x))

                /* populate observations array */
                for (const price of prices) {
                    await priceObserver.add(price)
                }
            })

            it("Returns the correct array", async () => {
                let expectedObservations: BigNumberish[] = [
                    2, 3, 4, 3, 7, 8, 12, 10, 11, 12, 14, 5, 5, 9, 10, 1, 1, 0,
                    2, 2, 3, 4, 6, 10,
                ].map((x) => ethers.BigNumber.from(x))

                expect(await priceObserver.getAll()).to.be.eq(
                    expectedObservations
                )
            })
        })
    })
})
