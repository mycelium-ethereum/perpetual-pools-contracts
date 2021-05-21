# Tracer Pool Swaps

Project base generated with the Typescript Solidity Dev Starter Kit. See [Blog Post](https://medium.com/@rahulsethuram/the-new-solidity-dev-stack-buidler-ethers-waffle-typescript-tutorial-f07917de48ae) for more details

## Environment variables
The environment variables used in this project are documented in the `example.env` file at the root of the project. To configure, create a copy of `example.env`, rename to `.env`, and replace the placeholders with the correct values. 

## Using this Project

Install the dependencies with `npm install`. 
Build everything with `npm run build`. 

## Available Functionality

### Build Contracts and Generate Typechain Typeings

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

### Run Coverage Report for Tests

`npm run coverage`

Notes:

- running a coverage report currently deletes artifacts, so after each coverage run you will then need to run `npx buidler clean` followed by `npm run build` before re-running tests

### Deploy to Ethereum

Create/modify network config in `hardhat.config.ts` and add API key and private key, then run:

`npx hardhat run --network rinkeby scripts/deploy.ts`

### Verify on Etherscan

Using the [hardhat-etherscan plugin](https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html), add Etherscan API key to `hardhat.config.ts`, then run:

`npx hardhat verify --network rinkeby <DEPLOYED ADDRESS>`

PRs and feedback welcome!
