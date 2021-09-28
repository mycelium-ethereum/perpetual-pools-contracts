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

    // #### Functions

    function commit(CommitType commitType, uint256 amount) external;

    function getCommit(uint128 _commitID) external view returns (Commit memory);

    function setQuoteAndPool(address quoteToken, address leveragedPool) external;
}
