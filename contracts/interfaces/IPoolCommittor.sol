// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

/*
@title The interface for the contract that handles pool commitments
*/
interface IPoolCommittor {
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
    event CreateCommit(uint128 indexed commitID, uint128 indexed amount, CommitType commitType);

    event RemoveCommit(uint128 indexed commitID, uint128 indexed amount, CommitType indexed commitType);

    event ExecuteCommit(uint128 commitID);

    // #### Functions

    function commit(CommitType commitType, uint112 amount) external;

    function uncommit(uint128 commitID) external;

    function executeCommitments(uint128[] calldata _commitIDs) external;

    function getCommit(uint128 _commitID) external view returns (Commit memory);

    function setLeveragedPool(address _leveragedPool) external;
}
