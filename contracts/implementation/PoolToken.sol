// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "../vendors/ERC20_Cloneable.sol";
import "../interfaces/IPoolToken.sol";

/// @title The pool token; used for ownership/shares of the underlying tokens of the long/short pool
/// @dev ERC_20_Cloneable contains onlyOwner code implemented for use with the cloneable setup
contract PoolToken is ERC20_Cloneable, IPoolToken {
    // #### Global state

    // #### Functions

    constructor() ERC20_Cloneable("BASE_TOKEN", "BASE") {}

    /**
     * @notice Mints pool tokens
     * @param amount Pool tokens to burn
     * @param account Account to burn pool tokens to
     * @return Whether the mint was successful
     */
    function mint(uint256 amount, address account) external override onlyOwner returns (bool) {
        _mint(account, amount);
        return true;
    }

    /**
     * @notice Burns pool tokens
     * @param amount Pool tokens to burn
     * @param account Account to burn pool tokens from
     * @return Whether the burn was successful
     */
    function burn(uint256 amount, address account) external override onlyOwner returns (bool) {
        _burn(account, amount);
        return true;
    }
}
