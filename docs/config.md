# Configuring Perpetual Pools #

Any given instance of a Perpetual Pools deployment consists of various
parameters that govern various aspects of the system's behaviour. Broadly, these
are divisible into two categories: factory parameters and pool parameters. The
latter category consists of the parameters responsible for a given pool and thus
do not affect the values of the former category.

## Roles ##

These are the *externally-facing* roles in an instance of a Perpetual Pools
system:

| Name | Description |
| --- | --- |
| Fee receiver | TODO |
| Secondary fee receiver | TODO |
| Factory owner | TODO |
| Pool owner | TODO |

## Parameters ##

### Pools ###

These are the configurable parameters of an individual pool:

| Name | Type | Deployment Only? | Who? | Description |
| --- | --- | --- | --- | --- |
| Pool Governor | `address` | False | Pool Governor | Essentially the owner of the pool |
| Secondary Fee Receiver | `address` | False | Secondary fee receiver | Receipient of secondary fee revenue |
| Fee Receiver | `address` | False | Pool Governor | Receipient of primary fee revenue |
| Oracle Wrapper | `address` | True | Deployer | TODO |
| Settlement ETH Oracle | `address` | True | Deployer | TODO |
| Long Token | `address` | True | Deployer | TODO |
| Short Token | `address` | True | Deployer | TODO |
| Pool Committer | `address` | True | Deployer | TODO |
| Invariant Checker | `address` | True | Deployer | TODO |
| Pool Name | `string` | True | Deployer | TODO |
| Frontrunning Interval | `uint32` | True | Deployer | TODO |
| Update Interval | `uint32` | True | Deployer | TODO |
| Leverage | `uint16` | True | Deployer | TODO |
| Fee | `uint256` | True | Deployer | TODO |
| Quote Token | `address` | True | Depoyer | TODO |

### Factory ###

| Name | Type | Deployment Only? | Who? | Description |
| --- | --- | --- | --- | --- |
| Factory Owner | `address` | False | Factory Owner | TODO |
| Mint/Burn Fee | `uint256` | False | Factory Owner | TODO |
| Primary Fee | `uint256` | False | Factory Owner | TODO |
| Secondary Fee | `uint256` | False | Factory Owner | TODO |
| Maximum Leverage | `uint256` | False | Factory Owner | TODO |
| Autoclaimer | `address` | False | Factory Owner | TODO |
| Pool Keeper | `address` | False | Factory Owner | TODO |

### Oracle Wrappers ###

#### SMA ####

| Name | Type | Deployment Only? | Who? | Description |
| --- | --- | --- | --- | --- |
| Sampling Periods | `uint256` | True | Deployer | Number of previous periods to be used for calculating the SMA |
| Price Observer | `address` | True | Deployer | Address of the `PriceObserver` contract which will provide historical **spot** price data |
| Spot Price Oracle | `address` | True | Deployer | Address of **spot** price oracle to average over |
| Update Interval | `uint256` | True | Deployer | Minimum number of seconds between price updates |
| Spot Oracle Precision | `uint256` | True | Deployer | Number of decimal places supported by the underlying spot oracle | 

#### Chainlink ####

| Name | Type | Deployment Only? | Who? | Description |
| --- | --- | --- | --- | --- |
| Oracle | `address` | True | Deployer | Address of the associated Chainlink oracle to wrap |

