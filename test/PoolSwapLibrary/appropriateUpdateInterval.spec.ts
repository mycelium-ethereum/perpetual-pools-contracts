import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import { PoolSwapLibrary, PoolSwapLibrary__factory } from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

chai.use(chaiAsPromised)
const { expect } = chai

describe("PoolSwapLibrary - appropriateUpdateInterval", () => {
    let signers: SignerWithAddress[]
    let library: PoolSwapLibrary
    beforeEach(async () => {
        // Deploy the contracts
        signers = await ethers.getSigners()

        const libraryFactory = (await ethers.getContractFactory(
            "PoolSwapLibrary",
            signers[0]
        )) as PoolSwapLibrary__factory

        library = await libraryFactory.deploy()
        await library.deployed()
    })

    context("frontRunningInterval < updateInterval", async () => {
        context("After frontrunning interval", async () => {
            it("Returns next update interval", async () => {
                const time = 200
                const lastPriceTimestamp = 110
                const frontRunningInterval = 20
                const updateInterval = 100
                const currentUpdateIntervalId = 3

                // Since 200 is after 110 + 100 - 20 = 190, it should return next update interval
                expect(
                    await library.appropriateUpdateIntervalId(
                        time,
                        lastPriceTimestamp,
                        frontRunningInterval,
                        updateInterval,
                        currentUpdateIntervalId
                    )
                ).to.equal(currentUpdateIntervalId + 1)
            })

            context("After next update interval", async () => {
                it("Returns arbitrary amount in future", async () => {
                    const time = 3001
                    const lastPriceTimestamp = 0
                    const frontRunningInterval = 20
                    const updateInterval = 100
                    const currentUpdateIntervalId = 3

                    // Since 3001 is 10 intervals after 0, so it should return 30 update intervals ahead
                    expect(
                        await library.appropriateUpdateIntervalId(
                            time,
                            lastPriceTimestamp,
                            frontRunningInterval,
                            updateInterval,
                            currentUpdateIntervalId
                        )
                    ).to.equal(currentUpdateIntervalId + 30)
                })
                it("Returns next update interval", async () => {
                    const time = 330
                    const lastPriceTimestamp = 110
                    const frontRunningInterval = 20
                    const updateInterval = 100
                    const currentUpdateIntervalId = 3

                    // Since 330 is after 110 + (100 * 2) = 310, it should return update interval after the next
                    expect(
                        await library.appropriateUpdateIntervalId(
                            time,
                            lastPriceTimestamp,
                            frontRunningInterval,
                            updateInterval,
                            currentUpdateIntervalId
                        )
                    ).to.equal(currentUpdateIntervalId + 2)
                })
            })

            context(
                "After next update interval's front running interval",
                async () => {
                    it("Returns next update interval", async () => {
                        const time = 300
                        const lastPriceTimestamp = 110
                        const frontRunningInterval = 20
                        const updateInterval = 100
                        const currentUpdateIntervalId = 3

                        // Since 300 is after 110 + (100 * 2) - 20 = 290, it should return update interval after the next
                        expect(
                            await library.appropriateUpdateIntervalId(
                                time,
                                lastPriceTimestamp,
                                frontRunningInterval,
                                updateInterval,
                                currentUpdateIntervalId
                            )
                        ).to.equal(currentUpdateIntervalId + 2)
                    })
                }
            )
        })

        context("Before frontrunning interval", async () => {
            it("Returns Current update interval", async () => {
                const time = 120
                const lastPriceTimestamp = 110
                const frontRunningInterval = 20
                const updateInterval = 100
                const currentUpdateIntervalId = 3

                // Since 120 is before 110 + 100 - 20 = 190, it should return current update interval
                expect(
                    await library.appropriateUpdateIntervalId(
                        time,
                        lastPriceTimestamp,
                        frontRunningInterval,
                        updateInterval,
                        currentUpdateIntervalId
                    )
                ).to.equal(currentUpdateIntervalId)
            })
            context("Before current timestamp", async () => {
                it("Reverts", async () => {
                    const time = 100
                    const lastPriceTimestamp = 110
                    const frontRunningInterval = 20
                    const updateInterval = 100
                    const currentUpdateIntervalId = 3

                    await expect(
                        library.appropriateUpdateIntervalId(
                            time,
                            lastPriceTimestamp,
                            frontRunningInterval,
                            updateInterval,
                            currentUpdateIntervalId
                        )
                    ).to.be.rejected // Library underflow
                })
            })
        })
    })

    context("frontRunningInterval == updateInterval", async () => {
        context("timestamp is before frontRunning interval", async () => {
            it("Reverts, because that means it is also before lastPriceTimestamp (and thus in the past)", async () => {
                const time = 109
                const lastPriceTimestamp = 110
                const frontRunningInterval = 100
                const updateInterval = 100
                const currentUpdateIntervalId = 3

                await expect(
                    library.appropriateUpdateIntervalId(
                        time,
                        lastPriceTimestamp,
                        frontRunningInterval,
                        updateInterval,
                        currentUpdateIntervalId
                    )
                ).to.be.rejected // Library underflow
            })
        })

        context("timestamp is after frontRunning interval", async () => {
            it("Returns next update interval", async () => {
                const time = 119
                const lastPriceTimestamp = 110
                const frontRunningInterval = 100
                const updateInterval = 100
                const currentUpdateIntervalId = 3

                expect(
                    await library.appropriateUpdateIntervalId(
                        time,
                        lastPriceTimestamp,
                        frontRunningInterval,
                        updateInterval,
                        currentUpdateIntervalId
                    )
                ).to.equal(currentUpdateIntervalId + 1)
            })
        })

        context("timestamp is after current update interval", async () => {
            it("Returns next update interval", async () => {
                const time = 200
                const lastPriceTimestamp = 110
                const frontRunningInterval = 100
                const updateInterval = 100
                const currentUpdateIntervalId = 3

                expect(
                    await library.appropriateUpdateIntervalId(
                        time,
                        lastPriceTimestamp,
                        frontRunningInterval,
                        updateInterval,
                        currentUpdateIntervalId
                    )
                ).to.equal(currentUpdateIntervalId + 1)
            })
        })
    })

    context("frontRunningInterval > updateInterval", async () => {
        context(
            "frontRunningInterval is just above updateInterval",
            async () => {
                it("Returns next update interval", async () => {
                    const time = 50
                    const lastPriceTimestamp = 0
                    const frontRunningInterval = 110
                    const updateInterval = 100
                    const currentUpdateIntervalId = 3

                    expect(
                        await library.appropriateUpdateIntervalId(
                            time,
                            lastPriceTimestamp,
                            frontRunningInterval,
                            updateInterval,
                            currentUpdateIntervalId
                        )
                    ).to.equal(currentUpdateIntervalId + 1)
                })
            }
        )

        context(
            "frontRunningInterval is just above updateInterval",
            async () => {
                context(
                    "Timestamp is inside frontrunning interval for the next update interval as well",
                    async () => {
                        it("Returns update interval after next", async () => {
                            const time = 149
                            const lastPriceTimestamp = 50
                            const frontRunningInterval = 110
                            const updateInterval = 100
                            const currentUpdateIntervalId = 3

                            expect(
                                await library.appropriateUpdateIntervalId(
                                    time,
                                    lastPriceTimestamp,
                                    frontRunningInterval,
                                    updateInterval,
                                    currentUpdateIntervalId
                                )
                            ).to.equal(currentUpdateIntervalId + 2)
                        })
                    }
                )
            }
        )

        context("frontRunningInterval is double updateInterval", async () => {
            context(
                "Timestamp is inside fromrunning interval for the next update interval as well",
                async () => {
                    it("Returns current update interval + 3", async () => {
                        const time = 101
                        const lastPriceTimestamp = 0
                        const frontRunningInterval = 200
                        const updateInterval = 100
                        const currentUpdateIntervalId = 3

                        expect(
                            await library.appropriateUpdateIntervalId(
                                time,
                                lastPriceTimestamp,
                                frontRunningInterval,
                                updateInterval,
                                currentUpdateIntervalId
                            )
                        ).to.equal(currentUpdateIntervalId + 3)
                    })
                }
            )

            context(
                "Timestamp gives enough time to just skip a single update interval",
                async () => {
                    it("Returns current update interval + 2", async () => {
                        const time = 50
                        const lastPriceTimestamp = 0
                        const frontRunningInterval = 200
                        const updateInterval = 100
                        const currentUpdateIntervalId = 3

                        expect(
                            await library.appropriateUpdateIntervalId(
                                time,
                                lastPriceTimestamp,
                                frontRunningInterval,
                                updateInterval,
                                currentUpdateIntervalId
                            )
                        ).to.equal(currentUpdateIntervalId + 2)
                    })
                }
            )
        })

        context(
            "frontRunningInterval is much larger than updateInterval (6x higher)",
            async () => {
                context(
                    "Current timestamp is before next update interval",
                    async () => {
                        it("Returns current update interval + 6", async () => {
                            const time = 50
                            const lastPriceTimestamp = 0
                            const frontRunningInterval = 600
                            const updateInterval = 100
                            const currentUpdateIntervalId = 3

                            expect(
                                await library.appropriateUpdateIntervalId(
                                    time,
                                    lastPriceTimestamp,
                                    frontRunningInterval,
                                    updateInterval,
                                    currentUpdateIntervalId
                                )
                            ).to.equal(currentUpdateIntervalId + 6)
                        })
                    }
                )
                context(
                    "Current timestamp is after next update interval",
                    async () => {
                        it("Returns current update interval + 7", async () => {
                            const time = 101
                            const lastPriceTimestamp = 0
                            const frontRunningInterval = 600
                            const updateInterval = 100
                            const currentUpdateIntervalId = 3

                            expect(
                                await library.appropriateUpdateIntervalId(
                                    time,
                                    lastPriceTimestamp,
                                    frontRunningInterval,
                                    updateInterval,
                                    currentUpdateIntervalId
                                )
                            ).to.equal(currentUpdateIntervalId + 7)
                        })
                    }
                )
            }
        )
    })
})
