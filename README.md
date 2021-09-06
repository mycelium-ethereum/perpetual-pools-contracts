# Tracer Perpetual Pools

Project base generated with the Typescript Solidity Dev Starter Kit. See [Blog Post](https://medium.com/@rahulsethuram/the-new-solidity-dev-stack-buidler-ethers-waffle-typescript-tutorial-f07917de48ae) for more details
## Frontend Notes
### Calculating ABDKMathQuad values
The `PoolSwapLibrary` contains several methods for generating, converting, and using the raw ratio values. These can be used in the frontend to estimate the result of a transaction. It is vital when estimating the result of a transaction that the shadow pool amount for the commit type's opposite is included in the token total supply.

## Environment variables
The environment variables used in this project are documented in the `example.env` file at the root of the project. To configure, create a copy of `example.env`, rename to `.env`, and replace the placeholders with the correct values. 

## Using this Project

Install the dependencies with `yarn`. 
Build everything with `yarn compile`. 
Run the tests with `yarn test`.

## Available Functionality

### Build Contracts and Generate Typechain Typeings
You'll need to run this before running tests if typescript throws an error about not finding the typechain artifacts.

`yarn refresh`

### Run Slither for static analysis report
If you have `slither` installed and on your PATH, you can run `npm run slither` to get a report on the current codebase.

 
### Deploy to Ethereum

Create/modify network config in `hardhat.config.ts` and add API key and private key, then run:

`npx hardhat run --network rinkeby scripts/deploy.ts`
**Note:** As of this commit, deploys are out of sync with the current contract set-up and therefore will not work.

### Verify on Etherscan

Using the [hardhat-etherscan plugin](https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html), add Etherscan API key to `hardhat.config.ts`, then run:

`npx hardhat verify --network rinkeby <DEPLOYED ADDRESS>`

PRs and feedback welcome!

## Frequently Asked Questions

**How are pool keepers to be chosen? How many keepers are there?** 

The Pool Keeper is simply a contract that enforces the correct keeper behaviour. Anyone may be a keeper by calling the keeper function on that contract with a pool that is valid for upkeep. We will initially be adding wrappers for Chainlink keepers as well as having custom keepers.

**The leveraged pool fee is represented as a `bytes16` value. Why is this chosen over something like `uint`? What denomination does this represent?**

The leveraged pool fee is a `bytes16` value simply due to the maths library used. We often represent values in WAD values (popularised by the Maker DAO team). WAD values are the integer value multiplied by 10^18 (e.g. `1 = 1*10^18`). The maths library we currently use represents values in IEEE quad precision numbers and uses bytes as way of storing this. A good primer on the above can be found [here](https://medium.com/coinmonks/math-in-solidity-part-1-numbers-384c8377f26d) and WAD / RAY maths is introduced [here](https://docs.makerdao.com/other-documentation/system-glossary).

**Difference between npx hardhat test and npm run coverage?**

`test` simply runs the test suite, while `coverage` runs the test suite and has additional functionality (not too sure how hardhat does this under the hood) to pick up test suite coverage. At the end of the day they both run the test suite though.

**How many different type of tests are there? There are unit tests in the test suite. Are there also end to end tests?**

Most tests are unit tests. There is a single E2E test in `e2e.spec.ts` right now. We plan to add more.

**Whats the `deployments/kovan` folder for? They seem to be different from the ABIs I get from `artifacts` folder when I compile.**

We use a plugin for hardhat called hardhat deploy that helps with deployment. They recommend you commit the `deployments` folder to have consistent data across deploys. The deploys you find there will be deploys that have been run from old versions of the contract, hence the ABI difference.
