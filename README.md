# Tracer Perpetual Pools
Project base generated with the Typescript Solidity Dev Starter Kit. See [Blog Post](https://medium.com/@rahulsethuram/the-new-solidity-dev-stack-buidler-ethers-waffle-typescript-tutorial-f07917de48ae) for more details

## C4 Audit Known Issues
In `PoolCommitter::commit`, `shadowPools[_commitType]` is passed in as a parameter to this function, but that's already been incremented yet the tokens haven't yet been burnt.

## Documentation
[Perpetual Pools - Documentation](https://tracerdao.notion.site/Perpetual-Pools-Documentation-ee935f325a9a448d9ed44e333dff0e74)

## Contract Addresses

These are the current contracts that are being used on Arbitrum One.

| Contract | Pool | Address |
| -------- | -------- | ------- |
| `OracleWrapper` for the BTC/USD oracle | N/A | [0xE973E6400B44fd20fc4752c03D112274A1374bA0](https://arbiscan.io/address/0xE973E6400B44fd20fc4752c03D112274A1374bA0) |
| `OracleWrapper` for the ETH/USD oracle | N/A | [0xeceaea7e0408606714b2559ac9b1d3d51a327afe](https://arbiscan.io/address/0xeceaea7e0408606714b2559ac9b1d3d51a327afe) |
| `PoolFactory` | N/A | [0x98C58c1cEb01E198F8356763d5CbA8EB7b11e4E2](https://arbiscan.io/address/0x98C58c1cEb01E198F8356763d5CbA8EB7b11e4E2) |
| `PoolKeeper` | N/A | [0x759E817F0C40B11C775d1071d466B5ff5c6ce28e](https://arbiscan.io/address/0x759E817F0C40B11C775d1071d466B5ff5c6ce28e) |
| `LeveragedPool` | 3p BTC/USD | [0x70988060e1FD9bbD795CA097A09eA1539896Ff5D](https://arbiscan.io/address/0x70988060e1FD9bbD795CA097A09eA1539896Ff5D) |
| `PoolCommitter` | 3p BTC/USD | [0xFDE5D7B7596AF6aC5df7C56d76E14518A9F578dF](https://arbiscan.io/address/0xFDE5D7B7596AF6aC5df7C56d76E14518A9F578dF) |
| `LeveragedPool` | 1p BTC/USD | [0x146808f54DB24Be2902CA9f595AD8f27f56B2E76](https://arbiscan.io/address/0x146808f54DB24Be2902CA9f595AD8f27f56B2E76) |
| `PoolCommitter` | 1p BTC/USD | [0x539Bf88D729B65F8eC25896cFc7a5f44bbf1816b](https://arbiscan.io/address/0x539Bf88D729B65F8eC25896cFc7a5f44bbf1816b) |
| `LeveragedPool` | 3p ETH/USD | [0x54114e9e1eEf979070091186D7102805819e916B](https://arbiscan.io/address/0x54114e9e1eEf979070091186D7102805819e916B) |
| `PoolCommitter` | 3p ETH/USD | [0x759E817F0C40B11C775d1071d466B5ff5c6ce28e](https://arbiscan.io/address/0x759E817F0C40B11C775d1071d466B5ff5c6ce28e) |
| `LeveragedPool` | 1p ETH/USD | [0x3A52aD74006D927e3471746D4EAC73c9366974Ee](https://arbiscan.io/address/0x3A52aD74006D927e3471746D4EAC73c9366974Ee) |
| `PoolCommitter` | 1p ETH/USD | [0x047Cd47925C2390ce26dDeB302b8b165d246d450](https://arbiscan.io/address/0x047Cd47925C2390ce26dDeB302b8b165d246d450) |

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

**How many different type of tests are there? There are unit tests in the test suite. Are there also end to end tests?**

Most tests are unit tests. There is a single E2E test in `e2e.spec.ts` right now. We plan to add more.

**Whats the `deployments/kovan` folder for? They seem to be different from the ABIs I get from `artifacts` folder when I compile.**

We use a plugin for hardhat called hardhat deploy that helps with deployment. They recommend you commit the `deployments` folder to have consistent data across deploys. The deploys you find there will be deploys that have been run from old versions of the contract, hence the ABI difference.
