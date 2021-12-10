import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    PriceObserver__factory,
    PriceObserver,
    PoolSwapLibrary__factory,
    PoolSwapLibrary,
    PoolFactory__factory,
    PoolFactory,
    PoolKeeper__factory,
    PoolKeeper,
} from "../types"

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber, BigNumberish } from "ethers"

chai.use(chaiAsPromised)
const { expect } = chai

describe("PriceObserver", async () => {
    let priceObserver: PriceObserver
    let signers: SignerWithAddress[]
    let owner: SignerWithAddress
    let nonOwner: SignerWithAddress
    let feeReceiver: SignerWithAddress
    let poolKeeper: PoolKeeper
    const CAPACITY: BigNumberish = 24

    beforeEach(async () => {
        /* retrieve signers */
        signers = await ethers.getSigners()
        owner = signers[0]
        nonOwner = signers[1]
        feeReceiver = signers[2]

        /* deploy PoolSwapLibrary (PoolFactory needs to be linked to it) */
        const poolSwapLibraryFactory: PoolSwapLibrary__factory =
            (await ethers.getContractFactory(
                "PoolSwapLibrary",
                signers[0]
            )) as PoolSwapLibrary__factory
        const poolSwapLibrary: PoolSwapLibrary =
            await poolSwapLibraryFactory.deploy()
        await poolSwapLibrary.deployed()

        /* deploy PoolFactory (PoolKeeper needs it) */
        const poolFactoryFactory = (await ethers.getContractFactory(
            "PoolFactory",
            {
                signer: signers[0],
                libraries: { PoolSwapLibrary: poolSwapLibrary.address },
            }
        )) as PoolFactory__factory
        const poolFactory = await poolFactoryFactory.deploy(feeReceiver.address)
        await poolFactory.deployed()

        /* deploy PoolKeeper */
        const poolKeeperFactory = (await ethers.getContractFactory(
            "PoolKeeper",
            {
                signer: signers[0],
                libraries: { PoolSwapLibrary: poolSwapLibrary.address },
            }
        )) as PoolKeeper__factory
        poolKeeper = await poolKeeperFactory.deploy(feeReceiver.address)
        await poolKeeper.deployed()

        /* deploy price observer contract */
        const priceObserverFactory = (await ethers.getContractFactory(
            "PriceObserver",
            owner
        )) as PriceObserver__factory
        priceObserver = await priceObserverFactory.deploy()
        await priceObserver.deployed()

        await priceObserver.setWriter(await owner.getAddress())
    })

    describe("capacity", async () => {
        context("When called", async () => {
            it("Returns the correct capacity", async () => {
                expect(await priceObserver.capacity()).to.be.eq(CAPACITY)
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
            beforeEach(async () => {
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

                expect(await priceObserver.getAll()).to.deep.eq(expectedPrices)
            })
        })
    })

    describe("getAll", async () => {
        context("When called", async () => {
            beforeEach(async () => {
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

                expect(await priceObserver.getAll()).to.deep.equal(
                    expectedObservations
                )
            })
        })
    })
})
