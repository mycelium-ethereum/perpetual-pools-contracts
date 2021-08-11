// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

/*
@title The pool controller contract interface
*/
interface ILeveragedPool {
    struct Initialization {
        address _owner;
        address _keeper; // The address of the PoolKeeper contract
        address _oracleWrapper;
        address _keeperOracle;
        address _longToken;
        address _shortToken;
        address _priceChanger;
        address _poolCommitter;
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

    function leverageAmount() external view returns (bytes16);

    function poolCommitter() external view returns (address);

    function priceChanger() external view returns (address);

    function oracleWrapper() external view returns (address);

    function lastPriceTimestamp() external view returns (uint40);

    function updateInterval() external view returns (uint32);

    function shortBalance() external view returns (uint112);

    function longBalance() external view returns (uint112);

    function frontRunningInterval() external view returns (uint32);

    function poolTokens() external view returns (address[2] memory);

    function keeperOracle() external view returns (address);

    function quoteToken() external view returns (address);

    // #### Functions
    /**
     * @notice Configures the pool on deployment. The pools are EIP 1167 clones.
     * @dev This should only be able to be run once to prevent abuse of the pool. Use of Openzeppelin Initializable or similar is recommended.
     * @param initialization The struct Initialization containing initialization data
     */
    function initialize(Initialization calldata initialization) external;

    // This would call `PriceChanger::executePriceChange` and `PoolCommitter::executeAllCommitments` and would have onlyKeeper modifier
    function poolUpkeep(int256 _oldPrice, int256 _newPrice) external;

    function quoteTokenTransferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    // This would be called in `PoolCommitter::executeCommitment` and `PriceChanger::executePriceChange` and would therefore have an onlyCommitterOrPriceChanger modifier or something
    function setNewPoolBalances(uint112 _longBalance, uint112 _shortBalance) external;

    function getOraclePrice() external view returns (int256);

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
     * @notice sets the address that can pull fees from this pool
     */
    function updateFeeAddress(address account) external;

    /**
     * @notice Mints new tokens
     * @param token The token to mint
     * @param amountIn The amount the user has committed to minting
     * @param balance The balance of pair at the start of the execution
     * @param inverseShadowbalance The amount of tokens burned from total supply
     * @param tokenOwner The address to send the tokens to
     */
    function mintTokens(
        uint256 token,
        uint112 amountIn,
        uint112 balance,
        uint112 inverseShadowbalance,
        address tokenOwner
    ) external;

    /**
     * @notice burns an amount of pool tokens from someones account
     */
    function burnTokens(
        uint256 token,
        uint256 amount,
        address burner
    ) external;
}
