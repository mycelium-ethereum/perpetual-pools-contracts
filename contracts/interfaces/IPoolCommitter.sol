//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

/// @title The interface for the contract that handles pool commitments
interface IPoolCommitter {
    /// Type of commit
    enum CommitType {
        ShortMint,
        ShortBurn,
        LongMint,
        LongBurn
    }

    // Commit information
    struct Commit {
        uint256 amount;
        CommitType commitType;
        uint40 created;
        address owner;
    }

    /**
     * @notice Creates a notification when a commit is created
     * @param commitID ID of the commit
     * @param amount Amount of the commit
     * @param commitType Type of the commit (Short v Long, Mint v Burn)
     */
    event CreateCommit(uint128 indexed commitID, uint256 indexed amount, CommitType indexed commitType);

    /**
     * @notice Creates a notification when a commit is removed (uncommitted)
     * @param commitID ID of the commit
     * @param amount Amount of the commit
     * @param commitType Type of the commit (Short v Long, Mint v Burn)
     */
    event RemoveCommit(uint128 indexed commitID, uint256 indexed amount, CommitType indexed commitType);

    /**
     * @notice Creates a notification when a commit is executed
     * @param commitID ID of the commit that's executed
     */
    event ExecuteCommit(uint128 commitID);

    /**
     * @notice Creates a notification when a commit fails to execute
     * @param commitID ID of the commit
     */
    event FailedCommitExecution(uint128 commitID);

    /**
     * @notice Creates a notification when the min commit size changes
     * @param _maximumCommitQueueLength New min commit size for mints and burns
     */
    event MinCommitSizeChanged(uint128 _maximumCommitQueueLength);

    /**
     * @notice Creates a notification when the max commit queue length changes
     * @param newMaxQueueLength New maximum queue length for an update interval
     */
    event MaxCommitQueueLengthChanged(uint128 newMaxQueueLength);

    // #### Functions

    function commit(CommitType commitType, uint256 amount) external;

    function executeAllCommitments() external;

    function executeCommitment(Commit memory _commit) external;

    function getCommit(uint128 _commitID) external view returns (Commit memory);

    function setQuoteAndPool(address quoteToken, address leveragedPool) external;

    function setMinimumCommitSize(uint128 _minimumCommitSize) external;

    function setMaxCommitQueueLength(uint128 _maximumCommitQueueLength) external;
}
