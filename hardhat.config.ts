import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { HardhatUserConfig } from "hardhat/types";

import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-log-remover";
import "hardhat-gas-reporter";

// TODO: reenable solidity-coverage when it works
// import "solidity-coverage";

const ALCHEMY_API_TESTNET_URL = process.env.ALCHEMY_API_TESTNET_URL || "";
const ALCHEMY_API_MAINNET_URL = process.env.ALCHEMY_API_MAINNET_URL || "";
const TESTNET_PRIVATE_KEY =
  process.env.TESTNET_PRIVATE_KEY ||
  "0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3"; // well known private key
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [{ version: "0.7.6", settings: {} }],
  },
  networks: {
    hardhat: {
      // gas: 15000000000,
      // blockGasLimit: 0x1fffffffffffff,
      // allowUnlimitedContractSize: true,
      forking: {
        url: ALCHEMY_API_MAINNET_URL,
        blockNumber: 12474747,
      },
    },

    kovan: {
      url: ALCHEMY_API_TESTNET_URL,
      accounts: [TESTNET_PRIVATE_KEY],
    },
    coverage: {
      url: "http://127.0.0.1:8555", // Coverage launches its own ganache-cli client
    },
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: ETHERSCAN_API_KEY,
  },
  mocha: {
    timeout: 60000,
  },
  gasReporter: {
    currency: "AUD",
    coinmarketcap: process.env.COINMARKET_KEY,
  },
};

export default config;
