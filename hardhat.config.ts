import { config as dotEnvConfig } from "dotenv"
dotEnvConfig()

import { HardhatUserConfig } from "hardhat/types"

import "@nomiclabs/hardhat-etherscan"
// import "@nomicfoundation/hardhat-verify";
import("@nomicfoundation/hardhat-toolbox")
// import "@typechain/hardhat"
// import "@nomiclabs/hardhat-waffle"
// import "@nomiclabs/hardhat-etherscan"
// import "hardhat-gas-reporter"
import "solidity-coverage"
import "@openzeppelin/hardhat-upgrades"
import "hardhat-log-remover"
import "hardhat-deploy"
import "hardhat-deploy-ethers"
import "hardhat-contract-sizer"

const ALCHEMY_API_TESTNET_URL = process.env.ALCHEMY_API_TESTNET_URL || "https://goerli-rollup.arbitrum.io/rpc"
const ALCHEMY_API_MAINNET_URL = process.env.ALCHEMY_API_MAINNET_URL || ""
const ALCHEMY_API_ARBITRUM_URL = process.env.ALCHEMY_API_ARBITRUM_URL || ""
const ARBITRUM_PRIVATE_KEY =
    process.env.ARBITRUM_PRIVATE_KEY ||
    "0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3" // well known private key
const TESTNET_PRIVATE_KEY =
    process.env.TESTNET_PRIVATE_KEY ||
    "0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3" // well known private key
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY

const config: HardhatUserConfig = {
    defaultNetwork: "hardhat",
    solidity: {
        compilers: [
            {
                version: "0.8.7",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        ],
    },
    networks: {
        goerli: {
            url: ALCHEMY_API_TESTNET_URL,
            accounts: [TESTNET_PRIVATE_KEY],
        },
        kovan: {
            url: ALCHEMY_API_TESTNET_URL,
            accounts: [TESTNET_PRIVATE_KEY],
        },
        arbRinkeby: {
            url: ALCHEMY_API_TESTNET_URL,
            accounts: [TESTNET_PRIVATE_KEY],
            // gasPrice: 200000000000,
        },
        arb: {
            url: ALCHEMY_API_ARBITRUM_URL,
            accounts: [ARBITRUM_PRIVATE_KEY],
            // gasPrice: 200000000000,
        },
        coverage: {
            url: "http://127.0.0.1:8555", // Coverage launches its own ganache-cli client
        },
        local: {
            url: "http://localhost:8545",
            gas: "auto",
        },
    },
    typechain: {
        outDir: "types",
        target: "ethers-v5",
    },
    etherscan: {
        apiKey: {
            mainnet: ETHERSCAN_API_KEY ?? '',
            goerli: ETHERSCAN_API_KEY ?? '',
        }
    },
    mocha: {
        timeout: 60000,
    },
    gasReporter: {
        currency: "AUD",
        coinmarketcap: process.env.COINMARKET_KEY,
    },
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
}

export default config
