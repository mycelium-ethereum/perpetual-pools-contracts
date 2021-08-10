// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/*
@title The pool controller contract interface
*/
interface ILeveragedPool {
    // #### Enum & Struct definitions
    enum CommitType {
        ShortMint,
        ShortBurn,
        LongMint,
        LongBurn
    }

    struct Commit {
        uint112 amount;
        CommitType commitType;
        uint40 created;
        address owner;
    }

    struct Initialization {
        address _owner;
        address _keeper; // The address of the PoolKeeper contract
        address _oracleWrapper;
        address _longToken;
        address _shortToken;
        string _poolCode; // The pool identification code. This is unique per pool per pool keeper
        uint32 _frontRunningInterval; // The minimum number of seconds that must elapse before a commit is forced to wait until the next interval
        uint32 _updateInterval; // The minimum number of seconds that must elapse before a commit can be executed.
        bytes16 _fee; // The fund movement fee. This amount is extracted from the deposited asset with every update and sent to the fee address.
        uint16 _leverageAmount; // The amount of exposure to price movements for the pool
        address _feeAddress; // The address that the fund movement fee is sent to
        address _quoteToken; //  The digital asset that the pool accepts
    }

    // #### Events
    /**
     * @notice Creates a notification when the pool is setup and ready for use
     * @param longToken The address of the LONG pair token
     * @param shortToken The address of the SHORT pair token
     * @param quoteToken The address of the digital asset that the pool accepts
     * @param poolCode The pool code for the pool
     */
    event PoolInitialized(address indexed longToken, address indexed shortToken, address quoteToken, string poolCode);

    /**
     * @notice Creates a notification when a commit is created in the pool
     * @param commitID The id of the new commit
     * @param amount The amount of tokens committed
     * @param commitType The commitment type
     */
    event CreateCommit(uint128 indexed commitID, uint128 indexed amount, CommitType commitType);

    /**
     * @notice Creates a notification for the removal of a commit that hasn't yet been executed
     * @param commitID The commit that was removed
     * @param amount The amount that was removed from the shadow ool
     * @param commitType The type of commit that was removed
     */
    event RemoveCommit(uint128 indexed commitID, uint128 indexed amount, CommitType indexed commitType);

    /**
     * @notice Creates a notification that a commit has been executed
     * @param commitID The commit that was executed
     */
    event ExecuteCommit(uint128 commitID);

    /**
     * @notice Creates a notification of a price execution
     * @param startPrice The price from the last execution
     * @param endPrice The price for this execution
     * @param transferAmount The amount that was transferred between pools
     */
    event PriceChange(int256 indexed startPrice, int256 indexed endPrice, uint112 indexed transferAmount);

    // ### Getters for public variables
    function updateInterval() external view returns (uint32);

    function oracleWrapper() external view returns (address);

    // #### Functions
    /**
     * @notice Configures the pool on deployment. The pools are EIP 1167 clones.
     * @dev This should only be able to be run once to prevent abuse of the pool. Use of Openzeppelin Initializable or similar is recommended.
     * @param initialization The struct Initialization containing initialization data
     */
    function initialize(Initialization calldata initialization) external;

    /**
     * @notice Wrapper function to get the latest oracle price (using getPrice)
     * @return Latest price from the oracle
     */
    function getOraclePrice() external view returns (int256);

    /**
     * @notice Creates a commitment to mint or burn
     * @param commitType Valid types are SB,SM, LB, LM. Each type contains position (Short, Long) and action (Mint, Burn).
     * @param amount the amount of the quote token that they wish to commit to a transaction
     */
    function commit(CommitType commitType, uint112 amount) external;

    /**
     * @notice Withdraws a user's existing commit. This cannot be used to remove another user's commits. The sender must own the commits they are withdrawing
     * @param commitID the ID of the commit to be withdrawn
     */
    function uncommit(uint128 commitID) external;

    /**
     * @notice Executes one or more commitments and effects the changes on the live and shadow pools respectively. This can be used to execute on any valid commits in the commit pool
     * @param _commitIDs an array of commits to execute. These do not have to all belong to the sender, nor do they need to be in a specific order.
     */
    function executeCommitment(uint128[] calldata _commitIDs) external;

    /**
     * @notice Processes the effect of a price change. This involves transferring funds from the losing pool to the other.
     * @dev This function should be called by the Pool Keeper.
     * @dev This function should be secured with some form of access control
     * @param oldPrice The previously executed price
     * @param newPrice The price for the latest interval.
     */
    function executePriceChange(int256 oldPrice, int256 newPrice) external;

    /**
     * @return true if the price was last updated more than updateInterval seconds ago
     */
    function intervalPassed() external view returns (bool);

    /**
     * @notice Changes the address of the keeper contract
     * @param _keeper Address of the new keeper contract
     */
    function setKeeper(address _keeper) external;

    /**
     * @dev Allows the governor to transfer governance rights to another address
     */
    function transferGovernance(address _governance) external;

    /**
     * @notice Updates the fee address
     * @dev This should be secured with some form of access control
     * @param account The new account to send fees to
     */
    function updateFeeAddress(address account) external;
}
