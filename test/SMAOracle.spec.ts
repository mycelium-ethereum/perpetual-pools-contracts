import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    PoolSwapLibrary,
    PoolSwapLibrary__factory,
    PoolFactory,
    PoolFactory__factory,
    PoolKeeper,
    PoolKeeper__factory,
    ChainlinkOracleWrapper__factory,
    ChainlinkOracleWrapper,
    TestChainlinkOracle__factory,
    TestChainlinkOracle,
    PriceObserver__factory,
    PriceObserver,
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
    let chainlinkOracle: TestChainlinkOracle
    let priceObserver: PriceObserver
    let poolKeeper: PoolKeeper
    let signers: SignerWithAddress[]
    let owner: SignerWithAddress
    let nonOwner: SignerWithAddress
    let feeReceiver: SignerWithAddress
    let numPeriods: BigNumberish
    let updateInterval: BigNumberish

    before(async () => {
        /* retrieve signers */
        signers = await ethers.getSigners()
        owner = signers[0]
        nonOwner = signers[1]
        feeReceiver = signers[2]

        /* configure deployment parameters */
        numPeriods = 5
        updateInterval = 5

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

        /* deploy test Chainlink oracle (we need something to feed into the wrapper) */
        const chainlinkOracleFactory = (await ethers.getContractFactory(
            "TestChainlinkOracle",
            signers[0]
        )) as TestChainlinkOracle__factory
        chainlinkOracle = await chainlinkOracleFactory.deploy()
        await chainlinkOracle.deployed()

        /* deploy spot oracle contract */
        const spotOracleFactory = (await ethers.getContractFactory(
            "ChainlinkOracleWrapper",
            owner
        )) as ChainlinkOracleWrapper__factory
        spotOracle = await spotOracleFactory.deploy(
            chainlinkOracle.address,
            signers[0].address
        )
        await spotOracle.deployed()

        /* deploy price observer contract */
        const priceObserverFactory = (await ethers.getContractFactory(
            "PriceObserver",
            owner
        )) as PriceObserver__factory
        priceObserver = await priceObserverFactory.deploy()
        await priceObserver.deployed()

        /* deploy SMA oracle contract */
        const smaOracleFactory = (await ethers.getContractFactory(
            "SMAOracle",
            owner
        )) as SMAOracle__factory
        smaOracle = await smaOracleFactory.deploy(
            spotOracle.address,
            await chainlinkOracle.decimals(),
            numPeriods,
            updateInterval,
            signers[0].address
        )
        await smaOracle.deployed()

        /* set our SMA oracle to the writer for the price observer contract */
        await priceObserver.setWriter(smaOracle.address)
    })

    async function updatePrice(
        price: BigNumberish,
        chainlink: TestChainlinkOracle,
        sma: SMAOracle
    ) {
        await chainlink.setPrice(price)
        await ethers.provider.send("evm_increaseTime", [updateInterval])
        await sma.poll()
    }

    describe("poll", async () => {
        context("When called while ramping up", async () => {
            context("When called the first time", async () => {
                let spotPrice: BigNumberish = 12 /* arbitrary */

                beforeEach(async () => {
                    await chainlinkOracle.setPrice(spotPrice)
                })

                it.skip("Returns spot price", async () => {
                    const expectedPrice: BigNumberish = spotPrice

                    await smaOracle.poll()

                    const actualPrice: BigNumberish = await smaOracle.getPrice()

                    expect(actualPrice).to.be.eq(expectedPrice)
                })
            })

            context("When called the second time", async () => {
                let spotPrices: BigNumber[] = [12, 33].map((x) =>
                    ethers.BigNumber.from(x)
                ) /* arbitrary */

                beforeEach(async () => {
                    await chainlinkOracle.setPrice(spotPrices[0])
                    await smaOracle.poll()
                    await chainlinkOracle.setPrice(spotPrices[1])
                })

                it.skip("Returns price averaged over two periods", async () => {
                    const expectedPrice: BigNumber = spotPrices[0]
                        .add(spotPrices[1])
                        .div(ethers.BigNumber.from(2))

                    await smaOracle.poll()

                    const actualPrice: BigNumberish = await smaOracle.getPrice()

                    expect(actualPrice).to.be.eq(expectedPrice)
                })
            })
        })

        context(
            "When called with observations array less than capacity",
            async () => {
                beforeEach(async () => {
                    /* size of this array needs to be less than the price observer's
                     * capacity */
                    const prices: BigNumberish[] = [
                        2, 3, 4, 3, 7, 8, 12, 10, 11, 12, 14, 5, 5, 9, 10, 1, 1,
                        0, 2, 2, 3, 4, 6,
                    ].map((x) =>
                        ethers.BigNumber.from(x).mul(
                            ethers.BigNumber.from(10).pow(8)
                        )
                    )

                    /* perform update */
                    for (const price of prices) {
                        await updatePrice(price, chainlinkOracle, smaOracle)
                    }

                    /* set the latest price (arbitrary) */
                    // chainlinkOracle.setPrice(10)
                })

                it("Updates the SMA price correctly", async () => {
                    await smaOracle.poll()

                    expect(await smaOracle.getPrice()).to.be.eq(
                        ethers.utils.parseEther("3.4")
                    )
                })
            }
        )
    })
})
