// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/// @title The interface for the contract that handles pool commitments
interface IPoolCommitter {
    enum CommitType {
        ShortMint,
        ShortBurn,
        LongMint,
        LongBurn
    }
    struct Commit {
        uint256 amount;
        CommitType commitType;
        uint40 created;
        address owner;
    }
    event CreateCommit(uint128 indexed commitID, uint256 indexed amount, CommitType commitType);

    event RemoveCommit(uint128 indexed commitID, uint256 indexed amount, CommitType indexed commitType);

    event ExecuteCommit(uint128 commitID);

    event FailedCommitExecution(uint128 commitID);

    // #### Functions

    function commit(CommitType commitType, uint256 amount) external;

    function uncommit(uint128 commitID) external;

    function executeAllCommitments() external;

    function executeCommitment(Commit memory _commit) external;

    function getCommit(uint128 _commitID) external view returns (Commit memory);

    function setQuoteAndPool(address quoteToken, address leveragedPool) external;
}
