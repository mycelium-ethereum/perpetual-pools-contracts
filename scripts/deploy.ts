import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ethers } from "hardhat"
import { arbitrumMainnet, arbitrumRinkeby, NetworkAddresses } from "./addresses"

async function contractAt(
    name: string,
    address: string,
    provider: SignerWithAddress,
    poolSwapLibrary?: string
) {
    let contractFactory
    if (poolSwapLibrary) {
        contractFactory = await ethers.getContractFactory(name, {
            libraries: {
                PoolSwapLibrary: poolSwapLibrary,
            },
        })
    } else {
        contractFactory = await ethers.getContractFactory(name)
    }
    if (provider) {
        contractFactory = contractFactory.connect(provider)
    }
    return await contractFactory.attach(address)
}

async function main() {
    /**
     * Use the addresses from https://pools.docs.tracer.finance/contract-addresses
     * when determining what to set certain parameters
     */

    const signers: SignerWithAddress[] = await ethers.getSigners()
    const network = await ethers.provider.getNetwork()
    let networkConstants: NetworkAddresses
    if (network.chainId == 42161) {
        networkConstants = arbitrumMainnet
    } else if ((network.chainId = 421611)) {
        networkConstants = arbitrumRinkeby
    } else {
        console.error("Chain ID %d not supported", network.chainId)
        return
    }

    /*
     * Enter the address of the PoolFactory contract.
     */
    const poolFactoryAddress = networkConstants.poolFactory
    /*
     * Set the leverage here. This can just be a plain number. e.g. 10 = 10x leverage
     */
    const leverage = 1
    /*
     * The update interval is the frequency of market updates in seconds. e.g. 3600 is 1 hour.
     */
    const updateInterval = 3600
    /*
     * The frontRunningInterval is the minimum number of seconds one must wait before their commitment
     * is executed. This exists because otherwise, individuals could mint into the favourable side of a
     * price change, capturing at least a very large percentage of the value transfer.
     */
    const frontRunningInterval = 28800
    /*
     * The minting fee is the percentage of each mint that is taken and then put back into that side's collateral.
     * This exists as a potential way to mitigate against volatility decay, because each mint adds back a little bit
     * to the valuation of all tokens.
     * This value should be a percentage in WAD format. Meaning a decimal, multiplied by 10 ** 18.
     * e.g. a 1% minting fee will be 0.01 * 10 ** 18.
     */
    const mintingFee = 0
    /*
     * The burning fee is used in the same way as the minting fee, but is instead taken out when a user burns their tokens.
     * This is capped at 10% in the contracts, so make sure not to set it above this.
     * The burning fee is of the same format as the minting fee, so a 0.5% burning fee, for example, would be 0.005 * 10 ** 18.
     */
    const burningFee = 0
    /**
     * The changeInterval is the amount which the minting fee can change per update interval,
     * based on whether there is volatility decay.
     * That is to say, `longPrice * shortPrice < 1` -> `mintingFee += changeInterval`.
     * It is recommended to set this to 0 unless you know what you are doing.
     */
    const changeInterval = 0
    /**
     * The settlementTokenAddress is the address which you want to use to invest in the market.
     * e.g. if it is the USDC address, users will deposit USDC into the market.
     */
    const settlementTokenAddress = networkConstants.usdc // USDC
    /**
     * This is the `IOracleWrapper` implementation which gives the price of ETH in the settlement token.
     * e.g. if the settlement token is a USD stablecoin, then settlementEthOracle should be an ETH/USD oracle wrapper.
     * If you are deploying a market with a settlement token for which there does not exist an oracle wrapper implementation,
     * you will need to deploy your own. This script assumes you already have one.
     */
    const settlementEthOracleAddress = networkConstants.ethUsdcOracleWrapper // ETH/USD oracleWrapper
    /**
     * The fee controller is the address that can change the minting and burning fees.
     * It is highly recommended that this is set to the Tracer dev multisig (0x0f78e8...), otherwise it will likely not
     * be considered a trustworthy market.
     * The feeController can not change annual protocol fee, only the minting and burning fee.
     */
    const feeController = networkConstants.devMultisig
    /**
     * This should be of the format BASE/QUOTE+SETTLEMENT.
     * For example, an ETH/BTC market settled in USDC would be called ETH/BTC+USDC.
     * The factory will then prepend the leverage as necessary.
     */
    const poolName = "BTC/USD+USDC"

    /**
     * Set this to the address of the underlying price feed.
     * Currently, we only support chainlink oracles. It is possible to implement an oracle wrapper and
     * a corresponding SMAOracle for other oracle providers, put unless you know what you are doing,
     * it is recommended to stick with Chainlink for now.
     * Find the chainlink arbitrum mainnet addresses here: https://data.chain.link/arbitrum/mainnet
     */
    const underlyingPriceFeed = networkConstants.ethUsdChainlinkFeed

    /**
     * Do you want to deploy an SMA (simple moving average) market? This helps mitigate against volatility decay
     * but also requires a long frontrunning interval, proportional to the length of the SMA sampling period.
     * e.g. 8 hours of SMA sampling usually requires an 8 hours frontrunning interval.
     */
    const usingSMA: boolean = true

    /**
     * Deploy the oracle wrapper that can either be used as the market oracle, or as the price feed for the market's SMA oracle.
     */
    const oracleWrapperFactory = await ethers.getContractFactory(
        "ChainlinkOracleWrapper"
    )
    let oracleWrapper = await oracleWrapperFactory.deploy(
        underlyingPriceFeed,
        signers[0].address
    )
    console.log("Deployed oracleWrapper: %s", oracleWrapper.address)

    if (usingSMA) {
        /**
         * The number of SMA periods refers to how many periods, each equal to updateInterval in length,
         * the oracle samples from to calculate the moving average.
         */
        const numSmaPeriods = 8
        const smaOracleFactory = await ethers.getContractFactory("SMAOracle")
        // Deploy the SMA oracle, using the oracle wrapper we just deployed as our underlying oracle wrapper
        oracleWrapper = await smaOracleFactory.deploy(
            oracleWrapper.address,
            numSmaPeriods,
            updateInterval,
            signers[0].address,
            networkConstants.poolKeeper,
            networkConstants.devMultisig
        )
    }

    const poolFactory = await contractAt(
        "PoolFactory",
        poolFactoryAddress,
        signers[0],
        networkConstants.poolSwapLibrary
    )

    /**
     * To deploy a market, you must pay a deployment fee of $TCR5000.
     */
    const tcrTokenAddress = networkConstants.tcr
    const tcr = await contractAt("ERC20_Cloneable", tcrTokenAddress, signers[0])
    await tcr.approve(poolFactory.address, await poolFactory.deploymentFee())

    console.log("")
    console.log("##### Deploying a market with the following parameters #####")
    console.log("poolName: %s", poolName)
    console.log("frontRunningInterval: %s", frontRunningInterval)
    console.log("updateInterval: %s", updateInterval)
    console.log("leverageAmount: %s", leverage)
    console.log("settlementToken: %s", settlementTokenAddress)
    console.log("oracleWrapper: %s", oracleWrapper.address)
    console.log("settlementEthOracle: %s", settlementEthOracleAddress)
    console.log("feeController: %s", feeController)
    console.log("mintingFee: %s", mintingFee)
    console.log("burningFee: %s", burningFee)
    console.log("changeInterval: %s", changeInterval)
    console.log("")

    const deployParams = {
        poolName: poolName,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: leverage,
        settlementToken: settlementTokenAddress,
        oracleWrapper: oracleWrapper.address,
        settlementEthOracle: settlementEthOracleAddress,
        feeController: feeController,
        mintingFee: mintingFee,
        burningFee: burningFee,
        changeInterval: changeInterval,
    }
    const receipt = await (await poolFactory.deployPool(deployParams)).wait()
    const deploymentEvent = receipt.events?.filter(
        (eventLog: { event: string }) => eventLog.event === "DeployPool"
    )
    if (deploymentEvent && deploymentEvent[0] && deploymentEvent[0].args) {
        console.log("Pool address: %s", deploymentEvent[0].args.pool)
        console.log(
            "PoolCommitter address: %s",
            deploymentEvent[0].args.poolCommitter
        )
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
