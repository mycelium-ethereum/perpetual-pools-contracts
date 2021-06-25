# Contract Reference

## PoolFactory
Used by the `PoolKeeper` to deploy a new pool and its pair tokens. The pool and the tokens are deployed as minimal clones. The factory will automatically deploy and initialise the base contracts when it is deployed.

The factory only needs to be deployed once. It can support multiple keepers, and multiple pools.

### Events
#### DeployPool
`event DeployPool(address indexed pool, string poolCode);`
Emitted every time a pool is deployed.
- `pool` The address of the new pool.
- `poolCode` The pool code for the newly deployed pool

### State changing functions
#### deployPool
```
function deployPool(
    address owner,
    string memory _poolCode,
    uint32 _frontRunningInterval,
    bytes16 _fee,
    uint16 _leverageAmount,
    address _feeAddress,
    address _quoteToken
  ) external returns (address);
```
Deploys a minimal clone of the `LeveragedPool` contract and two minimal clones of an ERC20 token for the pool to use as pair tokens. The pool and tokens are initialised. The access control for the two pair tokens is set to the newly deployed pool
- `owner` The access control for the pool's `executePriceChange` function is granted for this address. Typically this will be the keeper that is requesting the deployment.

## OracleWrapper
### Read only functions
#### assetOracles
`function assetOracles(string memory marketCode) external view returns (address);`
Returns the oracle being used for a given market.
- `marketCode` The market to look up.

#### getPrice
`function getPrice(string memory marketCode) external view returns (int256);`
Returns the price from the chainlink oracle for the latest round. 
- `marketCode` The market to look up.

### State changing functions
#### setOracle
`function setOracle(string memory marketCode, address oracle) external;`
Sets the oracle address for a market. By default this can only be used by the account that deployed the oracle wrapper. 
- `marketCode` The market to set an oracle for
- `oracle` The new oracle address. Currently this must conform to the Chain link `AggregatorV3Interface`. 

## PoolKeeper
Something about the constructor here.
### Events
#### CreatePool
```
event CreatePool(
    address indexed poolAddress,
    int256 indexed firstPrice,
    uint32 indexed updateInterval,
    string market
  );
```
Emitted when a new pool is created. 
- `poolAddress` The address of the new pool
- `firstPrice` The current price of the market oracle multiplied by 1e18. The pools use pricing with a fixed point of 18 decimal places.
- `updateInterval` The number of seconds that must elapse before a pool can have a price change execution
- `market` The market code for the market the pool was created in.

#### CreateMarket
`event CreateMarket(string marketCode, address oracle);`
Emitted when a market is created. 
- `marketCode` The new market's identifier
- `oracle` The oracle that the market will use for price change executions.

#### NewRound
```
event NewRound(
    int256 indexed oldPrice,
    int256 indexed newPrice,
    uint32 indexed updateInterval,
    string market
  );
```
Emitted when a new pricing interval occurs for a pool. This occurs when the current unix timestamp is greater than the last price execution time plus the pool's update interval. Not all price change executions will emit this. It should only be emitted once per market/update interval pair, by the upkeep transaction that occurs first in the new interval.
- `oldPrice` The price from the penultimate price execution.
- `newPrice` The new price used for execution in the interval just past. Both `oldPrice` and `newPrice` are an average of the price changes that have occurred during an interval (a price sample is taken whenever the price changes).
- `updateInterval` The size of the interval in seconds. 
- `market` The market identifier. Price data is gathered and stored for `marketCode`/`updateInterval` pairs, to easily share data between pools on the same interval tracking the same market. These two parameters allow access to the current price data.

#### PriceSample
```
event PriceSample(
    int256 indexed cumulativePrice,
    int256 indexed count,
    uint32 indexed updateInterval,
    string market
  );
```
Emitted when a price sample is taken for the current interval. The prices used in price change executions are the average price of a market during the interval. 
- `cumulativePrice` The sum of price samples taken during the interval
- `count` The number of samples taken so far
- `updateInterval` The interval length in seconds
- `market` The market identifier for the market that's been sampled

#### ExecutePriceChange
```
event ExecutePriceChange(
    int256 indexed oldPrice,
    int256 indexed newPrice,
    uint32 indexed updateInterval,
    string market,
    string pool
  );
```
Emitted when a pool has a price change execution. If a pool fails to update, a `PoolUpdateError` will be emitted instead.
- `pool` An 


#### PoolUpdateError
`event PoolUpdateError(string indexed poolCode, string reason);`
Emitted when a pool fails a price change execution. Since pools are updated in groups, this is used to signal an issue instead of reverting and leaving all pools out of date.
- `poolCode` The pool's identifier
- `reason` The reason for the failure. The most likely reason is that the `ERC20.transfer` call failed when transfering the fee to the fee holder.


### State changing functions
#### updateOracleWrapper
`function updateOracleWrapper(address oracle) external;`
 Updates the address of the oracle wrapper that the keeper uses to get price data. This can only be used by an account that has been granted the `ADMIN` role. By default this role is granted to the account that deployed the keeper. The contract uses Openzeppelin access controls, so this can be changed post deployment.
 - `oracle` The new oracle address.
 
#### createMarket
`function createMarket(string memory marketCode, address oracle) external;`
Creates a new market. This must be done before a pool can be created. This only needs to be done once for each asset to be tracked. Multiple pools at different intervals can use the same oracle.
- `marketCode` The unique market identifier. There is no restriction on format, but it must not already exist in the keeper. 
- `oracle` The oracle to use for the market.

#### createPool
```
function createPool(
    string memory marketCode,
    string memory poolCode,
    uint32 updateInterval,
    uint32 frontRunningInterval,
    bytes16 fee,
    uint16 leverageAmount,
    address feeAddress,
    address quoteToken
  ) external;
```
Creates a pool in a given market. 
- `marketCode` The identifier for the market to create the pool in. This must exist before the pool is created.
- `poolCode` The name of the pool. There are no restrictions on the format, however the pool must not already exist in the keeper.
- `updateInterval` The frequency in seconds that the pool will be updated
- `frontRunningInterval` The amount of time a user must commit to adding or withdrawing to the pool before the movement of funds can actually occur. This must be smaller than the update interval.
- `fee` The percentage fee to be charged with every price change execution. This is per update interval, so for 2% annual fee at 7 day updates, the fee would be 0.02 / 52 = ~0.00038. To generate the number in the correct format, the `PoolSwapLibrary.getRatio` method should be used.
- `leverageAmount` The amount to be applied in the power leverage calculation. Internally this is stored as a decimal so the `PoolSwapLibrary.convertDecimalToUInt` method should be used when retrieving a pool's leverage for users to view.
- `feeAddress` The address to send fees to
- `quoteToken` The address of the digital asset that the pool is demarcated in

## LeveragedPool
### Events
### Read only functions
### State changing functions

## PoolSwapLibrary
### Read only functions
#### getRatio
#### getAmountOut
#### compareDecimals
#### convertUIntToDecimal
#### convertDecimalToUInt
#### multiplyDecimalByUInt
#### divInt
#### getLossMultiplier
#### getLossAmount
#### one and zero
Getter functions for pregenerated decimal values for 1 and 0 respectively.
