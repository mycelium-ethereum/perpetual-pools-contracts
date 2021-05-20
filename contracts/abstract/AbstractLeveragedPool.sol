// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/*
@title The pool controller contract
*/
abstract contract AbstractLeveragedPool {
  // #### Struct definitions
  struct Commit {
    uint256 created;
    uint256 amount;
    uint256 maxImbalance;
    address owner;
    bytes2 commitType; // Valid values are: SB, SM, LB, LM. Contains position (Short, Long) and action (Mint, Burn)
  }

  // #### Globals
  // TODO: Rearrange to tight pack these for gas savings
  address[2] public tokens;
  uint256 public shortBalance;
  uint256 public longBalance;

  uint256 public lastPrice;
  uint256 public lastPriceTimestamp;

  address public immutable quoteToken;
  uint32 public updateInterval;
  uint32 public frontRunningInterval;

  uint16 public fee;
  uint16 public immutable leverageAmount;
  address public feeAddress;

  uint256 private commitIDCounter;
  mapping(uint256 => Commit) public commits;

  uint256 public shadowLongBalance;
  uint256 public shadowShortBalance;

  // #### Functions
  /**
  @notice Sets up the contract. Sets the parameters, and creates the two ERC20 tokens for the pool.
  @param _poolCode The pool's identifier. This will be appended onto a position code (-SHORT, and -LONG) to create the token names.
  @param _firstPrice The current price for the market
  @param _updateInterval The minimum amount of time that must elapse before a price update can occur. If the interval is 5 minutes, then the price cannot be updated until 5 minutes after the last update has elapsed.
  @param _frontRunningInterval The amount of time that must elapse between a commit and the next update interval before a commit can be executed. Must be shorter than the update interval to prevent deadlock.
  @param _fee The percentage fee that will be charged to the pool's capital on a successful price update
  @param _leverageAmount The leverage that the pool will expose it's depositors to
  @param _feeAddress The address that fees will be sent to on every price change
  @param _quoteToken The address of the digital asset that this pool contains
   */
  constructor(
    string memory _poolCode,
    uint256 _firstPrice,
    uint32 _updateInterval,
    uint32 _frontRunningInterval,
    uint16 _fee,
    uint16 _leverageAmount,
    address _feeAddress,
    address _quoteToken
  ) {
    quoteToken = _quoteToken;
    lastPrice = _firstPrice;
    updateInterval = _updateInterval;
    frontRunningInterval = _frontRunningInterval;
    fee = _fee;
    leverageAmount = _leverageAmount;
    feeAddress = _feeAddress;
  }

  /**
    @notice Creates a commitment to mint or burn
    @param commitType Valid types are SB,SM, LB, LM. Each type contains position (Short, Long) and action (Mint, Burn).
    @param maxImbalance The max imbalance between their target pool and its inverse. Imbalance is defined as longBalance / shortBalance
    @param amount the amount of the quote token that they wish to commit to a transaction
     */
  function commit(
    bytes2 commitType,
    uint256 maxImbalance,
    uint256 amount
  ) external virtual;

  /**
    @notice Withdraws a user's existing commit. This cannot be used to remove another user's commits. The sender must own the commits they are withdrawing
    @param commitID the ID of the commit to be withdrawn
     */
  function uncommit(uint256 commitID) external virtual;

  /**
    @notice Executes one or more commitments and effects the changes on the live and shadow pools respectively. This can be used to execute on any valid commits in the commit pool
    @param commitID an array of commits to execute. These do not have to all belong to the sender, nor do they need to be in a specific order.
     */
  function executeCommitment(uint256[] memory commitID) external virtual;

  /**
    @notice Processes the effect of a price change. The effect of a price change on a pool is left to the implementer. The pool stores the last price, and is given the latest price on update. 
    @dev This function should be called by the Pool Keeper.
    @dev This function should be secured with some form of access control
    @param endPrice The latest price from the oracle. 
    */
  function executePriceChange(uint256 endPrice) external virtual;

  /** 
    @notice Updates the fee address
    @dev This should be secured with some form of access control
    @param account The new account to send fees to
  */
  function updateFeeAddress(address account) external virtual;
}
