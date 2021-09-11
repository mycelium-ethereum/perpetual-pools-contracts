// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "../interfaces/ILeveragedPool.sol";
import "../interfaces/IPoolCommitter.sol";
import "../interfaces/IPoolToken.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./PoolSwapLibrary.sol";
import "../interfaces/IOracleWrapper.sol";

/// @title The pool controller contract
contract LeveragedPool is ILeveragedPool, Initializable {
    using SafeERC20 for IERC20;
    // #### Globals

    // Each balance is the amount of quote tokens in the pair
    uint256 public override shortBalance;
    uint256 public override longBalance;
    uint32 public override frontRunningInterval;
    uint32 public override updateInterval;

    bytes16 public fee;
    bytes16 public override leverageAmount;

    // Index 0 is the LONG token, index 1 is the SHORT token
    address[2] public tokens;

    address public governance;
    address public keeper;
    address public feeAddress;
    address public override quoteToken;
    address public override poolCommitter;
    uint256 public override lastPriceTimestamp;

    string public override poolName;
    address public override oracleWrapper;
    address public override settlementEthOracle;

    bool public paused;

    event Paused();
    event Unpaused();

    // #### Functions

    function initialize(ILeveragedPool.Initialization calldata initialization) external override initializer {
        require(initialization._feeAddress != address(0), "Fee address cannot be 0 address");
        require(initialization._quoteToken != address(0), "Quote token cannot be 0 address");
        require(initialization._oracleWrapper != address(0), "Oracle wrapper cannot be 0 address");
        require(initialization._settlementEthOracle != address(0), "Keeper oracle cannot be 0 address");
        require(initialization._owner != address(0), "Owner cannot be 0 address");
        require(initialization._keeper != address(0), "Keeper cannot be 0 address");
        require(initialization._longToken != address(0), "Long token cannot be 0 address");
        require(initialization._shortToken != address(0), "Short token cannot be 0 address");
        require(initialization._poolCommitter != address(0), "PoolCommitter cannot be 0 address");
        require(initialization._frontRunningInterval < initialization._updateInterval, "frontRunning > updateInterval");

        require(
            PoolSwapLibrary.compareDecimals(initialization._fee, PoolSwapLibrary.one) == -1,
            "Fee is greater than 100%"
        );

        // set the owner of the pool. This is governance when deployed from the factory
        governance = initialization._owner;

        // Setup variables
        keeper = initialization._keeper;
        oracleWrapper = initialization._oracleWrapper;
        settlementEthOracle = initialization._settlementEthOracle;
        quoteToken = initialization._quoteToken;
        frontRunningInterval = initialization._frontRunningInterval;
        updateInterval = initialization._updateInterval;
        fee = initialization._fee;
        leverageAmount = PoolSwapLibrary.convertUIntToDecimal(initialization._leverageAmount);
        feeAddress = initialization._feeAddress;
        lastPriceTimestamp = uint40(block.timestamp);
        poolName = initialization._poolName;
        tokens[0] = initialization._longToken;
        tokens[1] = initialization._shortToken;
        poolCommitter = initialization._poolCommitter;
        emit PoolInitialized(
            initialization._longToken,
            initialization._shortToken,
            initialization._quoteToken,
            initialization._poolName
        );
    }

    /**
     * @notice Execute a price change, then execute all commits in PoolCommitter
     * @dev This is the entry point to upkeep a market
     */
    function poolUpkeep(int256 _oldPrice, int256 _newPrice) external override onlyKeeper onlyUnpaused {
        require(intervalPassed(), "Update interval hasn't passed");
        lastPriceTimestamp = uint40(block.timestamp);
        // perform price change and update pool balances
        executePriceChange(_oldPrice, _newPrice);
        // execute pending commitments to enter and exit the pool
        IPoolCommitter(poolCommitter).executeAllCommitments();
    }

    /**
     * @notice Pay keeper some amount in the collateral token for the perpetual pools market
     * @param to Address of the pool keeper to pay
     * @param amount Amount to pay the pool keeper
     * @return Whether the keeper is going to be paid; false if the amount exceeds the balances of the
     *         long and short pool, and true if the keeper can successfully be paid out
     */
    function payKeeperFromBalances(address to, uint256 amount)
        external
        override
        onlyPoolKeeper
        onlyUnpaused
        returns (bool)
    {
        uint256 _shortBalance = shortBalance;
        uint256 _longBalance = longBalance;

        // If the rewards are more than the balances of the pool, the keeper does not get paid
        if (amount >= _shortBalance + _longBalance) {
            return false;
        }

        (uint256 shortBalanceAfterRewards, uint256 longBalanceAfterRewards) = PoolSwapLibrary.getBalancesAfterFees(
            amount,
            _shortBalance,
            _longBalance
        );

        shortBalance = shortBalanceAfterRewards;
        longBalance = longBalanceAfterRewards;

        // Pay keeper
        IERC20(quoteToken).safeTransfer(to, amount);

        return true;
    }

    /**
     * @notice Transfer tokens from pool to user
     * @param to Address of account to transfer to
     * @param amount Amount of quote tokens being transferred
     */
    function quoteTokenTransfer(address to, uint256 amount) external override onlyPoolCommitter onlyUnpaused {
        require(to != address(0), "To address cannot be 0 address");
        IERC20(quoteToken).safeTransfer(to, amount);
    }

    /**
     * @notice Transfer tokens from user to account
     * @param from The account that's transferring quote tokens
     * @param to Address of account to transfer to
     * @param amount Amount of quote tokens being transferred
     */
    function quoteTokenTransferFrom(
        address from,
        address to,
        uint256 amount
    ) external override onlyPoolCommitter onlyUnpaused {
        require(from != address(0), "From address cannot be 0 address");
        require(to != address(0), "To address cannot be 0 address");
        IERC20(quoteToken).safeTransferFrom(from, to, amount);
    }

    /**
     * @notice Execute the price change once the interval period ticks over, updating the long & short
     *         balances based on the change of the feed (upwards or downwards) and paying fees
     * @dev Can only be called by poolUpkeep; emits PriceChangeError if execution does not take place
     * @param _oldPrice Old price from the oracle
     * @param _newPrice New price from the oracle
     */
    function executePriceChange(int256 _oldPrice, int256 _newPrice) internal onlyUnpaused {
        // prevent a division by 0 in computing the price change
        // prevent negative pricing
        if (_oldPrice <= 0 || _newPrice <= 0) {
            emit PriceChangeError(_oldPrice, _newPrice);
        } else {
            uint256 _shortBalance = shortBalance;
            uint256 _longBalance = longBalance;
            PoolSwapLibrary.PriceChangeData memory priceChangeData = PoolSwapLibrary.PriceChangeData(
                _oldPrice,
                _newPrice,
                _longBalance,
                _shortBalance,
                leverageAmount,
                fee
            );
            (uint256 newLongBalance, uint256 newShortBalance, uint256 totalFeeAmount) = PoolSwapLibrary
                .calculatePriceChange(priceChangeData);

            emit PoolRebalance(
                int256(newShortBalance) - int256(_shortBalance),
                int256(newLongBalance) - int256(_longBalance)
            );
            // Update pool balances
            longBalance = newLongBalance;
            shortBalance = newShortBalance;
            // Pay the fee
            IERC20(quoteToken).safeTransfer(feeAddress, totalFeeAmount);
        }
    }

    /**
     * @notice Sets the long and short balances of the pools
     * @dev Can only be called by & used by the pool committer
     * @param _longBalance New balance of the long pool
     * @param _shortBalance New balancee of the short pool
     */
    function setNewPoolBalances(uint256 _longBalance, uint256 _shortBalance)
        external
        override
        onlyPoolCommitter
        onlyUnpaused
    {
        longBalance = _longBalance;
        shortBalance = _shortBalance;
    }

    /**
     * @notice Mint tokens to a user
     * @dev Can only be called by & used by the pool committer
     * @param token Index of token
     * @param amount Amount of tokens to mint
     * @param minter Address of user/minter
     */
    function mintTokens(
        uint256 token,
        uint256 amount,
        address minter
    ) external override onlyPoolCommitter onlyUnpaused {
        require(minter != address(0), "Minter address cannot be 0 address");
        require(token == 0 || token == 1, "Pool: token out of range");
        require(IPoolToken(tokens[token]).mint(amount, minter), "Mint failed");
    }

    /**
     * @notice Burn tokens by a user
     * @dev Can only be called by & used by the pool committer
     * @param token Index of token
     * @param amount Amount of tokens to burn
     * @param burner Address of user/burner
     */
    function burnTokens(
        uint256 token,
        uint256 amount,
        address burner
    ) external override onlyPoolCommitter onlyUnpaused {
        require(burner != address(0), "Burner address cannot be 0 address");
        require(token == 0 || token == 1, "Pool: token out of range");
        require(IPoolToken(tokens[token]).burn(amount, burner), "Burn failed");
    }

    /**
     * @return true if the price was last updated more than updateInterval seconds ago
     */
    function intervalPassed() public view override returns (bool) {
        return block.timestamp >= lastPriceTimestamp + updateInterval;
    }

    /**
     * @notice Updates the fee address of the pool
     * @param account New address of the fee address/receiver
     */
    function updateFeeAddress(address account) external override onlyGov onlyUnpaused {
        require(account != address(0), "Account cannot be 0 address");
        address oldFeeAddress = feeAddress;
        feeAddress = account;
        emit FeeAddressUpdated(oldFeeAddress, feeAddress);
    }

    /**
     * @notice Updates the keeper contract of the pool
     * @param _keeper New address of the keeper contract
     */
    function setKeeper(address _keeper) external override onlyGov onlyUnpaused {
        require(_keeper != address(0), "Keeper address cannot be 0 address");
        address oldKeeper = keeper;
        keeper = _keeper;
        emit KeeperAddressChanged(oldKeeper, keeper);
    }

    /**
     * @notice Transfer governance of the pool
     * @param _governance New address of the governance of the pool
     */
    function transferGovernance(address _governance) external override onlyGov onlyUnpaused {
        require(_governance != address(0), "Governance address cannot be 0 address");
        address oldGovAddress = governance;
        governance = _governance;
        emit GovernanceAddressChanged(oldGovAddress, governance);
    }

    /**
     * @return _latestPrice The oracle price
     * @return _lastPriceTimestamp The timestamp of the last upkeep
     * @return _updateInterval The update frequency for this pool
     * @dev To save gas so PoolKeeper does not have to make three external calls
     */
    function getUpkeepInformation()
        external
        view
        override
        returns (
            int256 _latestPrice,
            uint256 _lastPriceTimestamp,
            uint256 _updateInterval
        )
    {
        return (IOracleWrapper(oracleWrapper).getPrice(), lastPriceTimestamp, updateInterval);
    }

    /**
     * @return The price of the pool's feed oracle
     */
    function getOraclePrice() public view override returns (int256) {
        return IOracleWrapper(oracleWrapper).getPrice();
    }

    function poolTokens() external view override returns (address[2] memory) {
        return tokens;
    }

    function balances() external view override returns (uint256 _shortBalance, uint256 _longBalance) {
        return (shortBalance, longBalance);
    }

    /**
     * @notice Withdraws all available quote asset from the pool
     * @dev Pool must not be paused
     * @dev ERC20 transfer
     */
    function withdrawQuote() external onlyGov {
        require(paused, "Pool is live");
        IERC20 quoteERC = IERC20(quoteToken);
        uint256 balance = quoteERC.balanceOf(address(this));
        IERC20(quoteToken).safeTransfer(msg.sender, balance);
    }

    /**
     * @notice Pauses the pool
     * @dev Prevents all state updates until unpaused
     */
    function pause() external onlyGov {
        paused = true;
        emit Paused();
    }

    /**
     * @notice Unpauses the pool
     * @dev Prevents all state updates until unpaused
     */
    function unpause() external onlyGov {
        paused = false;
        emit Unpaused();
    }

    // #### Modifiers
    modifier onlyUnpaused() {
        require(!paused, "Pool is paused");
        _;
    }

    modifier onlyKeeper() {
        require(msg.sender == keeper, "msg.sender not keeper");
        _;
    }

    modifier onlyPoolCommitter() {
        require(msg.sender == poolCommitter, "msg.sender not poolCommitter");
        _;
    }

    modifier onlyPoolKeeper() {
        require(msg.sender == keeper, "sender not keeper");
        _;
    }

    modifier onlyGov() {
        require(msg.sender == governance, "msg.sender not governance");
        _;
    }
}
