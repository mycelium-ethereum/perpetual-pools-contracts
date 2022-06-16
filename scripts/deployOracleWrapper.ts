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

    /**
     * Set this to the address of the underlying price feed.
     * Currently, we only support chainlink oracles. It is possible to implement an oracle wrapper and
     * a corresponding SMAOracle for other oracle providers, put unless you know what you are doing,
     * it is recommended to stick with Chainlink for now.
     * Find the chainlink arbitrum mainnet addresses here: https://data.chain.link/arbitrum/mainnet
     */
    const underlyingPriceFeed1 = "ORACLE1_ADDRESS"
    const underlyingPriceFeed2 = "ORACLE2_ADDRESS"

    /**
     * Deploy the oracle wrapper that can either be used as the market oracle, or as the price feed for the market's SMA oracle.
     */
    const oracleWrapperFactory = await ethers.getContractFactory(
        "TwoAggregateChainlinkOracleWrapper"
    )
    let oracleWrapper = await oracleWrapperFactory.deploy(
        underlyingPriceFeed1,
        underlyingPriceFeed2,
        signers[0].address
    )
    console.log("Deployed oracleWrapper: %s", oracleWrapper.address)
    const oracleWrapperInstance = await contractAt(
        "TwoAggregateChainlinkOracleWrapper",
        oracleWrapper.address,
        signers[0]
    )

    console.log((await oracleWrapper.getPrice()).toString())
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
