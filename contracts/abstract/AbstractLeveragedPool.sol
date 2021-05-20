pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/AccessControl.sol";

/*
@title The pool controller contract
*/
contract AbstractLeveragedPool is AccessControl {
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
  address[2] tokens;
  uint256 shortBalance;
  uint256 longBalance;

  uint256 lastPrice;
  uint256 lastPriceTimestamp;

  address immutable quoteToken;
  uint32 updateInterval;
  uint32 frontRunningInterval;

  uint16 fee;
  uint16 leverageAmount;
  address feeAddress;

  uint256 commitIDCounter;
  mapping(uint256 => Commit) commits;

  uint256 shadowLongBalance;
  uint256 shadowShortBalance;
  // Roles
  bytes32 public constant UPDATER = keccak256("UPDATER");
  bytes32 public constant FEE_HOLDER = keccak256("FEE_HOLDER");

  // #### Functions
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
  ) external;

  /**
    @notice Withdraws a user's existing commit. This cannot be used to remove another user's commits. The sender must own the commits they are withdrawing
    @param commitID the ID of the commit to be withdrawn
     */
  function uncommit(uint256 commitID) external;

  /**
    @notice Executes one or more commitments and effects the changes on the live and shadow pools respectively. This can be used to execute on any valid commits in the commit pool
    @param commitID an array of commits to execute. These do not have to all belong to the sender, nor do they need to be in a specific order.
     */
  function executeCommitment(uint256[] memory commitID) external;

  /**
    @notice Processes the effect of a price change. The effect of a price change on a pool is left to the implementer. The pool stores the last price, and is given the latest price on update. 
    @dev This function should be called by the Pool Keeper.
    @param endPrice The latest price from the oracle. This 
    */
  function executePriceChange(uint256 endPrice) external onlyUpdater;

  /** */
  function updateFeeAddress(address account) external onlyFeeHolder;

  // #### Modifiers
  /**
    @notice Requires caller to have been granted the UPDATER role. Use this for functions that should be restricted to the PoolKeeper
     */
  modifier onlyUpdater {
    require(hasRole(UPDATER, msg.sender));
  }

  /** 
  @notice Requires caller to have been granted the FEE_HOLDER role.
  */
  modifier onlyFeeHolder {
    require(hasRole(FEE_HOLDER, msg.sender));
  }
}
