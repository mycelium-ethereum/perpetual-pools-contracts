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

    // User aggregate balance
    struct Balance {
        uint256 longTokens;
        uint256 shortTokens;
        uint256 settlementTokens;
    }

    // Token Prices
    struct Prices {
        bytes16 longPrice;
        bytes16 shortPrice;
    }

    // Commit information
    struct Commit {
        uint256 amount;
        CommitType commitType;
        uint40 created;
        address owner;
    }

    // Commit information
    struct Commitment {
        uint256 longMintAmount;
        uint256 longBurnAmount;
        uint256 shortMintAmount;
        uint256 shortBurnAmount;
        uint256 updateIntervalId;
    }

    /**
     * @notice Creates a notification when a commit is created
     * @param amount Amount of the commit
     * @param commitType Type of the commit (Short v Long, Mint v Burn)
     */
    event CreateCommit(uint256 indexed amount, CommitType indexed commitType);

    /**
     * @notice Creates a notification when a user's aggregate balance is updated
     */
    event AggregateBalanceUpdated(address indexed user);

    /**
     * @notice Creates a notification when a claim is made, depositing pool tokens in user's wallet
     */
    event Claim(address indexed user);

    // #### Functions

    function commit(CommitType commitType, uint256 amount) external;

    function claim(address user) external;

    function executeCommitments() external;

    function updateAggregateBalance(address user) external;

    function getAggregateBalance(address user) external returns (uint256 _longBalance, uint256 _shortBalance);

    function setQuoteAndPool(address quoteToken, address leveragedPool) external;
}
