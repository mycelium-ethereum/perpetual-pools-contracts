# Tracer Perpetual Pools #

Tracer Perpetual Pools V2 is the second major release of Tracer's Perpetual Pools product.

Tracer Perpetual Pools is a system that provides leveraged, tokenised exposure to arbitrary assets via a simple and elegant model where collateral is locked within the system in exchange for *pool tokens* (via *minting*) and pool tokens are returned to the protocol in exchange for (some of) the underlying collateral tokens (via *burning*).

For additional information on the higher-level economics of how Pools works, please consult the [whitepaper]().

## Prior Audit Work ##

### Version 1 ###

#### Sigma Prime ####

[Sigma Prime](https://sigmaprime.io) have performed an audit of the previous version of the codebase — i.e., Perpetual Pools v1. Both the audit report and the team's response to the audit's findings are available [here](https://tracer.finance/radar/sigma-prime-audit-response).

#### Code Arena ####

A crowdsourced audit was also undertaken via [Code 423n4](https://code4rena.com). The results are available [here](https://github.com/code-423n4/2021-10-tracer-findings).

### Version 2 ###

#### Runtime Verification ####

[Runtime Verification](https://runtimeverification.com) undertook an audit of a previous version of the V2 codebase. Their draft report is [here](https://github.com/mycelium-ethereum/perpetual-pools-contracts-v2-spearbit/blob/pools-v2/Tracer_Security_Audit_Report_DRAFT_2.pdf).

Note that we are still in the process of mitigating these defects, hence any duplicates of these can be considered as already acknowledged by the team.

#### CARE ####

Pools V2 also underwent a CARE program. The report for this is [here](https://docs.google.com/document/d/1S6pX2s-8lahcMIbyoR-jB_X6D_cmRy6CDXJCF1BV_Ig).

The vast majority of these defects have been mitigated and are included in this repository.

#### CARE-X ####

Pools V2 also obviously underwent a CARE-X program for this engagement also. The draft report is [here](https://docs.google.com/document/d/155dHh83kqwaeb8jJhqGIk_4w4Y_vJu9be2f1WV4779I).

#### Spearbit ####

Immediately after the CARE-X engagement, [Spearbit](https://spearbit.com) also undertook an audit of the V2 codebase. We are awaiting a report from them at the time of writing.

## Changes Since V1 ##

The most accurate version of this list is the set of all PRs merged in since 16 September 2021 until today (inclusive): https://github.com/tracer-protocol/perpetual-pools-contracts/pulls?q=is%3Apr+is%3Aclosed+merged%3A2021-09-16..2022-03-28

Regardless, an abridged list is provided for convenience:

 - SMA pricing is now available via SMAOracle.sol(https://github.com/tracer-protocol/perpetual-pools-contracts/pull/172)
 - The frontrunning interval is now able to be (and likely will be) much longer than the update interval (https://github.com/tracer-protocol/perpetual-pools-contracts/pull/190)
 - Commitments now occur in aggregate (https://github.com/tracer-protocol/perpetual-pools-contracts/pull/176)
 - Deployments of new instances of the Perpetual Pools system are now deterministic (https://github.com/tracer-protocol/perpetual-pools-contracts/pull/181)
 - Deployments are now permissionless (https://github.com/tracer-protocol/perpetual-pools-contracts/pull/186)
 - There is now an automatic claiming facility for users to have the results of their commitments occurring on their behalf (https://github.com/tracer-protocol/perpetual-pools-contracts/pull/256)
 - Minting and burning (both forms of commitments) now incur independent fees (https://github.com/tracer-protocol/perpetual-pools-contracts/pull/211)

## Known Issues ##

Any issues in the [public repository](https://github.com/tracer-protocol/perpetual-pools-contracts) that were opened **prior to the start of this audit** are considered known and thus out-of-scope.

## Security Assumptions ##

Any given pool will be upkept (that is to say `PoolCommitter::performUpkeepSinglePool` or `PoolCommitter::performUpkeepMultiplePools` is called with the LeveragedPool's address as a parameter) within a reasonable time after an update interval finishes (~15 minutes maximum).

## Update Interval ##

The update interval (`LeveragedPool::updateInterval`) is typically 1 hour (3600 seconds).

## Contributing ##

### Install ###

```
$ git clone git@github.com:tracer-protocol/perpetual-pools-contracts.git
$ cd perpetual-pools-contracts
perpetual-pools-contracts$ yarn install
```

### Compile ###

```
$ yarn run compile
```

### Test ###

```
$ yarn run test
```

### Lint ###

```
$ yarn run lint # to check
$ yarn run lint:fix # to fix
```

### Miscellaneous ###

#### Slither ####

Requires [Slither](https://github.com/crytic/slither/) to both be installed and on current `PATH`.

```
$ yarn run slither
```

#### UML Diagrams ####

Via [`sol2uml`](https://github.com/naddison36/sol2uml):

```
$ yarn run uml
```

#### Coverage ####

Note that this can take a while and also both gas usage and contract code size metrics will be incorrect (this is due to added overhead due to instrumentation).

```
$ yarn run coverage
```
 
### Deploy to Ethereum

Create/modify network config in `hardhat.config.ts` and add API key and private key, then run:

##### Deploy on Arbitrum Mainnet
`npx hardhat deploy --network arb --tags ArbDeploy --reset`

##### Deploy on Arbitrum Rinkeby
`npx hardhat deploy --network arbRinkeby --tags ArbRinkebyDeploy --reset`

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
