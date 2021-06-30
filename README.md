# Tracer Pool Swaps

Project base generated with the Typescript Solidity Dev Starter Kit. See [Blog Post](https://medium.com/@rahulsethuram/the-new-solidity-dev-stack-buidler-ethers-waffle-typescript-tutorial-f07917de48ae) for more details
## Frontend Notes
### Calculating ABDKMathQuad values
The `PoolSwapLibrary` contains several methods for generating, converting, and using the raw ratio values. These can be used in the frontend to estimate the result of a transaction. It is vital when estimating the result of a transaction that the shadow pool amount for the commit type's opposite is included in the token total supply.

## Environment variables
The environment variables used in this project are documented in the `example.env` file at the root of the project. To configure, create a copy of `example.env`, rename to `.env`, and replace the placeholders with the correct values. 

## Using this Project

Install the dependencies with `npm install`. 
Build everything with `npm run build`. 

## Available Functionality

### Build Contracts and Generate Typechain Typeings
You'll need to run this before running tests if typescript throws an error about not finding the typechain artifacts.

`npm run compile`

### Run Contract Tests & Get Callstacks

In one terminal run `npx hardhat node`

Then in another run `npm run test`. 

Notes:
- You will need a valid api key for Alchemy api for the tests to succeed. This is due to the integration with chainlink - the test environment forks mainnet at block `12474747`.
- The gas usage table may be incomplete (the gas report currently needs to run with the `--network localhost` flag; see below).

### Run Contract Tests and Generate Gas Usage Report

In one terminal run `npx hardhat node`

Then in another run `npm run test -- --network localhost`

Notes:

- When running with this `localhost` option, you get a gas report but may not get good callstacks
- See [here](https://github.com/cgewecke/eth-gas-reporter#installation-and-config) for how to configure the gas usage report.

### Run Slither for static analysis report
If you have `slither` installed and on your PATH, you can run `npm run slither` to get a report on the current codebase.

### Run Coverage Report for Tests

`npm run coverage`

Notes:

- running a coverage report currently deletes artifacts, so after each coverage run you will then need to run `npx hardhat clean` followed by `npm run build` before re-running tests
 
### Deploy to Ethereum
There is a built in deployment script for the contracts. It's intended to be used on a testnet (and was tested to work on kovan). The PoolFactory contract won't deploy to goerli due to the lower block gas limit (currently 8 million). It was tested against a fork of mainnet (12 million gas limit) during development. 

To use the script, there are two options available.
#### Pre-built commands
Use the two prebuilt script commands: `npm run deploy:localhost:all` to deploy to a local hardhat node, or `npm run deploy:testnet:all` to deploy to the configured testnet (kovan)

#### Run the script with custom options
Hardhat requires the network to be set via environment variable for the current usage. Add `HARDHAT_NETWORK="kovan" ` (change to your preferred testnet) before running the commands below.
To run the script manually, use `npx ts-node scripts/deploy.ts` with the following flags.
- `--all` Will deploy a new instance of each contract. This will override the contracts and address type flags
- `--contracts PoolSwapLibrary PoolKeeper PoolFactory OracleWrapper` Deploys a new instance of each contract named. If deploying the factory and not the library, you must provide the address of a library instance. If deploying the pool keeper by itself, you must provide the address of a factory and oracle wrapper instance.
- `--factory 0xabcd` The address of a deployed PoolFactory instance
- `--oracle 0xabcd` The address of a deployed OracleWrapper instance
- `--library 0xabcd` The address of a deployed PoolSwapLibrary instance
- `--verify` Verifies the deployed contracts on etherscan. This requires an etherscan key to be configured in the `.env`

Example usages:
- `HARDHAT_NETWORK='kovan' npx ts-node  scripts/deploy.ts --contracts PoolFactory PoolSwapLibrary OracleWrapper` Will deploy the factory, library, and oracle wrapper
- `HARDHAT_NETWORK='kovan' npx ts-node  scripts/deploy.ts --contracts PoolFactory PoolKeeper PoolSwapLibrary OracleWrapper --verify` Will deploy all contracts and verify on etherscan. This is the same as using the `--all --verify` flags.
- `HARDHAT_NETWORK='kovan' npx ts-node  scripts/deploy.ts --all --verify` Deploy all contracts and verify on etherscan
- `HARDHAT_NETWORK='kovan' npx ts-node  scripts/deploy.ts --contracts PoolKeeper --factory 0xfdca221410B054770F987dBDe82Bed671f3af1d5 --oracle 0x20C3868b4cf0aD0F1b23F561Ea9c2254389C7Eb6` Deploy a new pool keeper using an existing factory and oracle wrapper.

### Verify on Etherscan

Verification can be run automatically during deployment with the `--verify` flag. 

Using the [hardhat-etherscan plugin](https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html), add Etherscan API key to `hardhat.config.ts`, then run:

`npx hardhat verify --network rinkeby <DEPLOYED ADDRESS>`

PRs and feedback welcome!
