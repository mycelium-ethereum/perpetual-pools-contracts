import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    ChainlinkOracleWrapper__factory,
    ChainlinkOracleWrapper,
    TestChainlinkOracle__factory,
    TestChainlinkOracle,
    SMAOracle__factory,
    SMAOracle,
} from "../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber, BigNumberish } from "ethers"

chai.use(chaiAsPromised)
const { expect } = chai

describe("SMAOracle", async () => {
    let smaOracle: SMAOracle
    let spotOracle: ChainlinkOracleWrapper
    let signers: SignerWithAddress[]
    let owner: SignerWithAddress
    let nonOwner: SignerWithAddress
    let numPeriods: BigNumberish

    before(async () => {
        /* retrieve signers */
        signers = await ethers.getSigners()
        owner = signers[0]
        nonOwner = signers[1]

        /* configure deployment parameters */
        numPeriods = 24

        /* deploy test Chainlink oracle (we need something to feed into the wrapper) */
        signers = await ethers.getSigners()
        const chainlinkOracleFactory = (await ethers.getContractFactory(
            "TestChainlinkOracle",
            signers[0]
        )) as TestChainlinkOracle__factory
        const chainlinkOracle = await chainlinkOracleFactory.deploy()

        /* deploy spot oracle contract */
        const spotOracleFactory = (await ethers.getContractFactory(
            "ChainlinkOracleWrapper",
            owner
        )) as ChainlinkOracleWrapper__factory
        spotOracle = await spotOracleFactory.deploy(chainlinkOracle.address)

        /* deploy SMA oracle contract */
        const smaOracleFactory = (await ethers.getContractFactory(
            "SMAOracle",
            owner
        )) as SMAOracle__factory
        smaOracle = await smaOracleFactory.deploy(
            spotOracle.address,
            numPeriods
        )
    })

    describe("SMA", async () => {
        context(
            "When called with number of periods less than the size of the dataset and with a valid dataset",
            async () => {
                it("Returns the correct simple moving average", async () => {
                    /* xs is arbitrary (provided it's 24 elements long) */
                    const xs: any = [
                        2, 3, 4, 3, 7, 8, 12, 10, 11, 12, 14, 5, 5, 9, 10, 1, 1,
                        0, 2, 2, 3, 4, 6, 10,
                    ]
                    const k: BigNumberish = 5

                    const actualSMA: BigNumber = await smaOracle.SMA(xs, k)
                    /* (10 + 6 + 4 + 3 + 2) / 5 = 25 / 5 = 5 */
                    const expectedSMA: BigNumberish = 5

                    expect(actualSMA).to.eq(expectedSMA)
                })
            }
        )

        context(
            "When called with number of periods equal to the size of the dataset and with a valid dataset",
            async () => {
                it("Returns the correct simple moving average", async () => {
                    /* xs is arbitrary (provided it's 24 elements long) */
                    const xs: any = [
                        2, 3, 4, 3, 7, 8, 12, 10, 11, 12, 14, 5, 5, 9, 10, 1, 1,
                        0, 2, 2, 3, 4, 6, 10,
                    ]
                    const k: BigNumberish = xs.length

                    const actualSMA: BigNumber = await smaOracle.SMA(xs, k)
                    /* (10 + 6 + 4 + 3 + 2 + 2 + 0 + 1 + 1 + 10 + 9 + 5 + 5 + 14 + 12 + 11 + 10 + 12 + 8 + 7 + 3 + 4 + 3 + 2) / 24 = 144 / 24 = 6 */
                    const expectedSMA: BigNumberish = 6

                    expect(actualSMA).to.eq(expectedSMA)
                })
            }
        )

        context(
            "When called with number of periods greater than size of dataset",
            async () => {
                it("Reverts", async () => {
                    /* xs is arbitrary (provided it's 24 elements long) */
                    const xs: any = [
                        2, 3, 4, 3, 7, 8, 12, 10, 11, 12, 14, 5, 5, 9, 10, 1, 1,
                        0, 2, 2, 3, 4, 6, 10,
                    ]
                    /* k needs to be greater than the length of xs */
                    const k: BigNumberish = xs.length + 1

                    await expect(smaOracle.SMA(xs, k)).to.be.revertedWith(
                        "SMA: Out of bounds"
                    )
                })
            }
        )

        context("When called with zero periods", async () => {
            it("Reverts", async () => {
                /* xs is arbitrary (provided it's 24 elements long) */
                const xs: any = [
                    2, 3, 4, 3, 7, 8, 12, 10, 11, 12, 14, 5, 5, 9, 10, 1, 1, 0,
                    2, 2, 3, 4, 6, 10,
                ]
                /* k needs to be greater than the length of xs */
                const k: BigNumberish = 0

                await expect(smaOracle.SMA(xs, k)).to.be.revertedWith(
                    "SMA: Out of bounds"
                )
            })
        })
    })
})
