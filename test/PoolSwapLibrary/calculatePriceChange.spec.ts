import { ethers } from "hardhat"
import chai, { expect } from "chai"
import chaiAsPromised from "chai-as-promised"
import { PoolSwapLibrary, PoolSwapLibrary__factory } from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber } from "ethers"

chai.use(chaiAsPromised)

const convertToChainlinkOracleDecimals = (price: number) => {
    return ethers.BigNumber.from(price).mul(ethers.BigNumber.from(10).pow(8))
}

/**
 * This is required because chai's expect().to.be.within() requires two numbers, and our BigNumbers are too large to convert
 */
const assertIsWithinBounds = (
    expectedValue: BigNumber,
    actualValue: BigNumber,
    epsilon: BigNumber
) => {
    const upperBound = BigNumber.from(expectedValue).add(epsilon)
    const lowerBound = BigNumber.from(expectedValue).sub(epsilon)

    expect(actualValue).is.gte(lowerBound)
    expect(actualValue).is.lte(upperBound)
}

// Precision given by python, which was used to compute correct results.
const PYTHON_EPSILON = ethers.utils.parseEther("0.000000000001")

/**
 * calculateValueTransfer uses the sigmoid function to determine value transfer.
 * The function we use in particular is:
 * when newPrice >= oldPrice
 *     losing_pool_multiplier = 2 / (1 + e^(-2 * L * (1 - (oldPrice / newPrice)))) - 1
 * when newPrice < oldPrice
 *     losing_pool_multiplier = 2 / (1 + e^(-2 * L * (1 - (newPrice / oldPrice)))) - 1
 * where
 *     e = euler's number
 *     L = leverage
 *     newPrice = the new oracle price
 *     oldPrice = the previous oracle price
 *
 * Python code for calculating the value transfer can be found here: https://gist.github.com/CalabashSquash/c1c37717af7c45c98bdf4c5f6e2fe308/revisions#diff-f49d16002bba11ab89a9dc1c07ddccd563e9f5f27a13f68521a95b4a304a8753R12-R21
 *
 * The correct/expected values for longBalance and shortBalance were calculated using this python code.
 * We use an epsilon, determined by the precision provided by python.
 */
describe("PoolSwapLibrary - calculateValueTransfer", () => {
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

    context("3x leverage", async () => {
        context("Price remains the same", async () => {
            it("Does not transfer", async () => {
                const shortBalance = ethers.utils.parseEther("1000")
                const longBalance = ethers.utils.parseEther("1000")
                const leverageAmount = await library.convertUIntToDecimal(3)
                const oldPrice = convertToChainlinkOracleDecimals(2000)
                const newPrice = convertToChainlinkOracleDecimals(2000)
                const fee = await library.convertUIntToDecimal(0)

                const results = await library.calculateValueTransfer(
                    shortBalance,
                    longBalance,
                    leverageAmount,
                    oldPrice,
                    newPrice,
                    fee
                )

                const expectedLongBalance = ethers.utils.parseEther("1000")
                const expectedShortBalance = ethers.utils.parseEther("1000")

                // longBalance
                assertIsWithinBounds(
                    expectedLongBalance,
                    results[0],
                    PYTHON_EPSILON
                )
                // shortBalance
                assertIsWithinBounds(
                    expectedShortBalance,
                    results[1],
                    PYTHON_EPSILON
                )
            })
        })
        context("Price increase", async () => {
            context("Price increases by 1%", async () => {
                it("Transfers correct values", async () => {
                    const shortBalance = ethers.utils.parseEther("1000")
                    const longBalance = ethers.utils.parseEther("1000")
                    const leverageAmount = await library.convertUIntToDecimal(3)
                    const oldPrice = convertToChainlinkOracleDecimals(2000)
                    const newPrice = convertToChainlinkOracleDecimals(2020)
                    const fee = await library.convertUIntToDecimal(0)

                    const results = await library.calculateValueTransfer(
                        shortBalance,
                        longBalance,
                        leverageAmount,
                        oldPrice,
                        newPrice,
                        fee
                    )

                    const expectedLongBalance =
                        ethers.utils.parseEther("1029.6942380673468")
                    const expectedShortBalance =
                        ethers.utils.parseEther("970.3057619326531")

                    // longBalance
                    assertIsWithinBounds(
                        expectedLongBalance,
                        results[0],
                        PYTHON_EPSILON
                    )
                    // shortBalance
                    assertIsWithinBounds(
                        expectedShortBalance,
                        results[1],
                        PYTHON_EPSILON
                    )
                })
            })
            context("Price doubles", async () => {
                it("Transfers correct values", async () => {
                    const shortBalance = ethers.utils.parseEther("1000")
                    const longBalance = ethers.utils.parseEther("1000")
                    const leverageAmount = await library.convertUIntToDecimal(3)
                    const oldPrice = convertToChainlinkOracleDecimals(2000)
                    const newPrice = convertToChainlinkOracleDecimals(4000)
                    const fee = await library.convertUIntToDecimal(0)

                    const results = await library.calculateValueTransfer(
                        shortBalance,
                        longBalance,
                        leverageAmount,
                        oldPrice,
                        newPrice,
                        fee
                    )

                    const expectedLongBalance =
                        ethers.utils.parseEther("1905.1482536448666")
                    const expectedShortBalance =
                        ethers.utils.parseEther("94.85174635513327")

                    // longBalance
                    assertIsWithinBounds(
                        expectedLongBalance,
                        results[0],
                        PYTHON_EPSILON
                    )
                    // shortBalance
                    assertIsWithinBounds(
                        expectedShortBalance,
                        results[1],
                        PYTHON_EPSILON
                    )
                })
            })
        })

        context("Price decrease", async () => {
            context("Price decreases 1%", async () => {
                it("Transfers correct values", async () => {
                    const shortBalance = ethers.utils.parseEther("1000")
                    const longBalance = ethers.utils.parseEther("1000")
                    const leverageAmount = await library.convertUIntToDecimal(3)
                    const oldPrice = convertToChainlinkOracleDecimals(2000)
                    const newPrice = convertToChainlinkOracleDecimals(1980)
                    const fee = await library.convertUIntToDecimal(0)

                    const results = await library.calculateValueTransfer(
                        shortBalance,
                        longBalance,
                        leverageAmount,
                        oldPrice,
                        newPrice,
                        fee
                    )

                    const expectedLongBalance =
                        ethers.utils.parseEther("970.0089967611798")
                    const expectedShortBalance =
                        ethers.utils.parseEther("1029.9910032388202")

                    // longBalance
                    assertIsWithinBounds(
                        expectedLongBalance,
                        results[0],
                        PYTHON_EPSILON
                    )
                    // shortBalance
                    assertIsWithinBounds(
                        expectedShortBalance,
                        results[1],
                        PYTHON_EPSILON
                    )
                    expect(results[0].add(results[1])).to.equal(
                        shortBalance.add(longBalance)
                    )
                })
            })

            context("Price halves", async () => {
                it("Transfers correct values", async () => {
                    const shortBalance = ethers.utils.parseEther("1000")
                    const longBalance = ethers.utils.parseEther("1000")
                    const leverageAmount = await library.convertUIntToDecimal(3)
                    const oldPrice = convertToChainlinkOracleDecimals(4000)
                    const newPrice = convertToChainlinkOracleDecimals(2000)
                    const fee = await library.convertUIntToDecimal(0)

                    const results = await library.calculateValueTransfer(
                        shortBalance,
                        longBalance,
                        leverageAmount,
                        oldPrice,
                        newPrice,
                        fee
                    )

                    const expectedLongBalance =
                        ethers.utils.parseEther("94.85174635513327")
                    const expectedShortBalance =
                        ethers.utils.parseEther("1905.1482536448666")

                    // longBalance
                    assertIsWithinBounds(
                        expectedLongBalance,
                        results[0],
                        PYTHON_EPSILON
                    )
                    // shortBalance
                    assertIsWithinBounds(
                        expectedShortBalance,
                        results[1],
                        PYTHON_EPSILON
                    )
                })
            })

            context("Price goes to 0", async () => {
                it("Transfers correct values", async () => {
                    const shortBalance = ethers.utils.parseEther("1000")
                    const longBalance = ethers.utils.parseEther("1000")
                    const leverageAmount = await library.convertUIntToDecimal(3)
                    const oldPrice = convertToChainlinkOracleDecimals(1000)
                    const newPrice = convertToChainlinkOracleDecimals(0)
                    const fee = await library.convertUIntToDecimal(0)

                    const results = await library.calculateValueTransfer(
                        shortBalance,
                        longBalance,
                        leverageAmount,
                        oldPrice,
                        newPrice,
                        fee
                    )

                    const expectedLongBalance =
                        ethers.utils.parseEther("4.945246313269314")
                    const expectedShortBalance =
                        ethers.utils.parseEther("1995.0547536867307")

                    // longBalance
                    assertIsWithinBounds(
                        expectedLongBalance,
                        results[0],
                        PYTHON_EPSILON
                    )
                    // shortBalance
                    assertIsWithinBounds(
                        expectedShortBalance,
                        results[1],
                        PYTHON_EPSILON
                    )
                })
            })
        })
    })
    context("1x leverage", async () => {
        context("Price remains the same", async () => {
            it("Does not transfer", async () => {
                const shortBalance = ethers.utils.parseEther("1000")
                const longBalance = ethers.utils.parseEther("1000")
                const leverageAmount = await library.convertUIntToDecimal(1)
                const oldPrice = convertToChainlinkOracleDecimals(2000)
                const newPrice = convertToChainlinkOracleDecimals(2000)
                const fee = await library.convertUIntToDecimal(0)

                const results = await library.calculateValueTransfer(
                    shortBalance,
                    longBalance,
                    leverageAmount,
                    oldPrice,
                    newPrice,
                    fee
                )

                const expectedLongBalance = ethers.utils.parseEther("1000")
                const expectedShortBalance = ethers.utils.parseEther("1000")

                // longBalance
                assertIsWithinBounds(
                    expectedLongBalance,
                    results[0],
                    PYTHON_EPSILON
                )
                // shortBalance
                assertIsWithinBounds(
                    expectedShortBalance,
                    results[1],
                    PYTHON_EPSILON
                )
            })
        })
        context("Price increase", async () => {
            context("Price increases by 1%", async () => {
                it("Transfers correct values", async () => {
                    const shortBalance = ethers.utils.parseEther("1000")
                    const longBalance = ethers.utils.parseEther("1000")
                    const leverageAmount = await library.convertUIntToDecimal(1)
                    const oldPrice = convertToChainlinkOracleDecimals(2000)
                    const newPrice = convertToChainlinkOracleDecimals(2020)
                    const fee = await library.convertUIntToDecimal(0)

                    const results = await library.calculateValueTransfer(
                        shortBalance,
                        longBalance,
                        leverageAmount,
                        oldPrice,
                        newPrice,
                        fee
                    )

                    const expectedLongBalance =
                        ethers.utils.parseEther("1009.9006665816463")
                    const expectedShortBalance =
                        ethers.utils.parseEther("990.0993334183537")

                    // longBalance
                    assertIsWithinBounds(
                        expectedLongBalance,
                        results[0],
                        PYTHON_EPSILON
                    )
                    // shortBalance
                    assertIsWithinBounds(
                        expectedShortBalance,
                        results[1],
                        PYTHON_EPSILON
                    )
                })
            })
            context("Price doubles", async () => {
                it("Transfers correct values", async () => {
                    const shortBalance = ethers.utils.parseEther("1000")
                    const longBalance = ethers.utils.parseEther("1000")
                    const leverageAmount = await library.convertUIntToDecimal(1)
                    const oldPrice = convertToChainlinkOracleDecimals(2000)
                    const newPrice = convertToChainlinkOracleDecimals(4000)
                    const fee = await library.convertUIntToDecimal(0)

                    const results = await library.calculateValueTransfer(
                        shortBalance,
                        longBalance,
                        leverageAmount,
                        oldPrice,
                        newPrice,
                        fee
                    )

                    const expectedLongBalance =
                        ethers.utils.parseEther("1462.1171572600097")
                    const expectedShortBalance =
                        ethers.utils.parseEther("537.8828427399902")

                    // longBalance
                    assertIsWithinBounds(
                        expectedLongBalance,
                        results[0],
                        PYTHON_EPSILON
                    )
                    // shortBalance
                    assertIsWithinBounds(
                        expectedShortBalance,
                        results[1],
                        PYTHON_EPSILON
                    )
                })
            })
        })

        context("Price decrease", async () => {
            context("Price decreases 1%", async () => {
                it("Transfers correct values", async () => {
                    const shortBalance = ethers.utils.parseEther("1000")
                    const longBalance = ethers.utils.parseEther("1000")
                    const leverageAmount = await library.convertUIntToDecimal(1)
                    const oldPrice = convertToChainlinkOracleDecimals(2000)
                    const newPrice = convertToChainlinkOracleDecimals(1980)
                    const fee = await library.convertUIntToDecimal(0)

                    const results = await library.calculateValueTransfer(
                        shortBalance,
                        longBalance,
                        leverageAmount,
                        oldPrice,
                        newPrice,
                        fee
                    )

                    const expectedLongBalance =
                        ethers.utils.parseEther("990.0003333200004")
                    const expectedShortBalance =
                        ethers.utils.parseEther("1009.9996666799996")

                    // longBalance
                    assertIsWithinBounds(
                        expectedLongBalance,
                        results[0],
                        PYTHON_EPSILON
                    )
                    // shortBalance
                    assertIsWithinBounds(
                        expectedShortBalance,
                        results[1],
                        PYTHON_EPSILON
                    )
                    expect(results[0].add(results[1])).to.equal(
                        shortBalance.add(longBalance)
                    )
                })
            })

            context("Price halves", async () => {
                it("Transfers correct values", async () => {
                    const shortBalance = ethers.utils.parseEther("1000")
                    const longBalance = ethers.utils.parseEther("1000")
                    const leverageAmount = await library.convertUIntToDecimal(1)
                    const oldPrice = convertToChainlinkOracleDecimals(4000)
                    const newPrice = convertToChainlinkOracleDecimals(2000)
                    const fee = await library.convertUIntToDecimal(0)

                    const results = await library.calculateValueTransfer(
                        shortBalance,
                        longBalance,
                        leverageAmount,
                        oldPrice,
                        newPrice,
                        fee
                    )

                    const expectedLongBalance =
                        ethers.utils.parseEther("537.8828427399902")
                    const expectedShortBalance =
                        ethers.utils.parseEther("1462.1171572600097")

                    // longBalance
                    assertIsWithinBounds(
                        expectedLongBalance,
                        results[0],
                        PYTHON_EPSILON
                    )
                    // shortBalance
                    assertIsWithinBounds(
                        expectedShortBalance,
                        results[1],
                        PYTHON_EPSILON
                    )
                })
            })

            context("Price goes to 0", async () => {
                it("Transfers correct values", async () => {
                    const shortBalance = ethers.utils.parseEther("1000")
                    const longBalance = ethers.utils.parseEther("1000")
                    const leverageAmount = await library.convertUIntToDecimal(1)
                    const oldPrice = convertToChainlinkOracleDecimals(1000)
                    const newPrice = convertToChainlinkOracleDecimals(0)
                    const fee = await library.convertUIntToDecimal(0)

                    const results = await library.calculateValueTransfer(
                        shortBalance,
                        longBalance,
                        leverageAmount,
                        oldPrice,
                        newPrice,
                        fee
                    )

                    const expectedLongBalance =
                        ethers.utils.parseEther("238.40584404423538")
                    const expectedShortBalance =
                        ethers.utils.parseEther("1761.5941559557646")

                    // longBalance
                    assertIsWithinBounds(
                        expectedLongBalance,
                        results[0],
                        PYTHON_EPSILON
                    )
                    // shortBalance
                    assertIsWithinBounds(
                        expectedShortBalance,
                        results[1],
                        PYTHON_EPSILON
                    )
                })
            })
        })
    })
})
