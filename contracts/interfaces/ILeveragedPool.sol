// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/*
@title The pool controller contract interface
*/
interface ILeveragedPool {
  // #### Struct & Enum definitions
  enum CommitType { ShortMint, ShortBurn, LongMint, LongBurn }

  struct Commit {
    uint256 created;
    uint128 amount;
    uint256 maxImbalance;
    address owner;
    CommitType commitType;
  }

  // #### Events
  /**
    @notice Creates a notification when the pool is setup and ready for use
    @param longToken The address of the LONG pair token
    @param shortToken The address of the SHORT pair token
    @param quoteToken The address of the digital asset that the pool accepts
    @param poolCode The pool code for the pool
   */
  event PoolInitialized(
    address indexed longToken,
    address indexed shortToken,
    address quoteToken,
    string poolCode
  );

  /**
    @notice Creates a notification when a commit is created in the pool
    @param commitID The id of the new commit
    @param amount The amount of tokens committed
    @param maxImbalance The max imbalance between the pairs that the commit will tolerate
    @param commitType The commitment type
   */
  event CreateCommit(
    uint256 indexed commitID,
    uint128 indexed amount,
    uint256 indexed maxImbalance,
    CommitType commitType
  );

  /**
    @notice Creates a notification for the removal of a commit that hasn't yet been executed
    @param commitID The commit that was removed
    @param amount The amount that was removed from the shadow ool
    @param commitType The type of commit that was removed
   */
  event RemoveCommit(
    uint256 indexed commitID,
    uint256 indexed amount,
    CommitType indexed commitType
  );

  /**
  @notice Creates a notification that a commit has been executed
  @param commitID The commit that was executed
 */
  event ExecuteCommit(uint256 commitID);

  // #### Functions
  /**
  @notice Configures the pool on deployment. The pools are EIP 1167 clones.
  @dev This should only be able to be run once to prevent abuse of the pool. Use of Openzeppelin Initializable or similar is recommended.
  @param _poolCode The pool identification code. This is unique per pool per pool keeper
  @param _firstPrice The initial price of the asset that the pool tracks
  @param _updateInterval The frequency in seconds at which the pool will be updated. Must be large enough to handle a 15 second margin
  @param _frontRunningInterval The minimum number of seconds that must elapse before a commit can be executed. Must be smaller than the update interval to prevent deadlock. The difference must be greater than 15 seconds.
  @param _fee The fund movement fee. This amount is extracted from the deposited asset with every update and sent to the fee address.
  @param _leverageAmount The amount of exposure to price movements for the pool
  @param _feeAddress The address that the fund movement fee is sent to
  @param _quoteToken The digital asset that the pool accepts
 */
  function initialize(
    string memory _poolCode,
    int256 _firstPrice,
    uint32 _updateInterval,
    uint32 _frontRunningInterval,
    uint16 _fee,
    uint16 _leverageAmount,
    address _feeAddress,
    address _quoteToken
  ) external;

  /**
    @notice Creates a commitment to mint or burn
    @param commitType Valid types are SB,SM, LB, LM. Each type contains position (Short, Long) and action (Mint, Burn).
    @param maxImbalance The max imbalance between their target pool and its inverse. Imbalance is defined as longBalance / shortBalance
    @param amount the amount of the quote token that they wish to commit to a transaction
     */
  function commit(
    CommitType commitType,
    uint256 maxImbalance,
    uint128 amount
  ) external;

  /**
    @notice Withdraws a user's existing commit. This cannot be used to remove another user's commits. The sender must own the commits they are withdrawing
    @param commitID the ID of the commit to be withdrawn
     */
  function uncommit(uint256 commitID) external;

  /**
    @notice Executes one or more commitments and effects the changes on the live and shadow pools respectively. This can be used to execute on any valid commits in the commit pool
    @param _commitIDs an array of commits to execute. These do not have to all belong to the sender, nor do they need to be in a specific order.
     */
  function executeCommitment(uint256[] memory _commitIDs) external;

  /**
    @notice Processes the effect of a price change. The effect of a price change on a pool is left to the implementer. The pool stores the last price, and is given the latest price on update. 
    @dev This function should be called by the Pool Keeper.
    @dev This function should be secured with some form of access control
    @param endPrice The latest price from the oracle. 
    */
  function executePriceChange(uint256 endPrice) external;

  /** 
    @notice Updates the fee address
    @dev This should be secured with some form of access control
    @param account The new account to send fees to
  */

  function updateFeeAddress(address account) external;

  /**
    @notice Calculates the ratio between two numbers to 18 decimal places.
    @dev Rounds any overflow towards 0. If either parameter is zero, the ratio is 0.
    @param _numerator The "parts per" side of the equation. If this is zero, the ratio is zero
    @param _denominator The "per part" side of the equation. If this is zero, the ratio is zero
    @return the ratio, as a fixed point number with 18 decimal places
 */
  function getRatio(uint128 _numerator, uint128 _denominator)
    external
    pure
    returns (uint256);

  /**
    @notice Gets the amount of tokens a user is entitled to according to the ratio
    @dev This is useful for getting the amount of pool tokens to mint, and the amount of quote tokens to remit when minting and burning. Can also be used to provide the user with an estimate of their commit results.
    @param ratio The ratio to calculate. Use the getRatio function to calculate this
    @param amountIn The amount of tokens the user is providing. This can be quote tokens or pool tokens.
    @return The amount of tokens to mint/remit to the user.
   */
  function getAmountOut(uint256 ratio, uint128 amountIn)
    external
    pure
    returns (uint256);

  // // #########################################################
  // // ############ Getter Definitions #########################
  // // #########################################################
  // /**
  //   @notice Returns the pool code for the pool
  //   @dev This is a convenience definition for the autogenerated getter
  //  */
  // function poolCode() external view returns (string memory);

  // /**
  //   @notice Returns the address for one of the pair tokens in the pool. Index 0 is the LONG pair token, and index 1 is the SHORT token.
  //   @dev This is a convenience definition for the autogenerated getter
  //  */
  // function tokens(uint256) external view returns (address);

  // /**
  // @notice Returns the price from the last update
  // @dev This is a convenience definition for the autogenerated getter
  //  */
  // function lastPrice() external view returns (int256);

  // /**
  // @notice Returns the time of the last update
  // @dev This is a convenience definition for the autogenerated getter
  //  */
  // function lastPriceTimestamp() external view returns (uint256);

  // /**
  // @notice Returns the address of the quote token for the pool
  // @dev This is a convenience definition for the autogenerated getter
  //  */
  // function quoteToken() external view returns (address);

  // /**
  // @notice Returns the update interval for the pool
  // @dev This is a convenience definition for the autogenerated getter
  //  */
  // function updateInterval() external view returns (uint32);

  // /**
  // @notice Returns the front running interval for the pool
  // @dev This is a convenience definition for the autogenerated getter
  //  */
  // function frontRunningInterval() external view returns (uint32);

  // /**
  // @notice Returns the fund movement fee for the pool
  // @dev This is a convenience definition for the autogenerated getter
  //  */
  // function fee() external view returns (uint16);

  // /**
  // @notice Returns the leverage amount for the pool
  // @dev This is a convenience definition for the autogenerated getter
  //  */
  // function leverageAmount() external view returns (uint16);

  // /**
  // @notice Returns the address that fees are transferred to
  // @dev This is a convenience definition for the autogenerated getter
  //  */
  // function feeAddress() external view returns (address);

  // /**
  // @notice Returns the commit for the given commit id
  // @dev This is a convenience definition for the autogenerated getter
  //  */
  // function commits(uint256)
  //   external
  //   view
  //   returns (
  //     uint256 created,
  //     uint128 amount,
  //     uint256 maxImbalance,
  //     address owner,
  //     CommitType commitType
  //   );

  // /**
  // @notice Returns the shadow pool details
  // @dev This is a convenience definition for the autogenerated getter
  //  */
  // function shadowPools(CommitType) external view returns (uint256);

  // /**
  // @notice Returns the ID of the last commit to be created
  // @dev This is a convenience definition for the autogenerated getter
  //  */
  // function commitIDCounter() external view returns (uint256);
}
