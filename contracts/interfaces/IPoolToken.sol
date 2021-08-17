pragma solidity 0.8.6;

/// @title Interface for the pool tokens
interface IPoolToken {
    /**
     * @notice Mints pool tokens
     * @param amount Pool tokens to burn
     * @param account Account to burn pool tokens to
     * @return Whether the mint was successful
     */
    function mint(uint256 amount, address account) external returns (bool);

    /**
     * @notice Burns pool tokens
     * @param amount Pool tokens to burn
     * @param account Account to burn pool tokens from
     * @return Whether the burn was successful
     */
    function burn(uint256 amount, address account) external returns (bool);
}
