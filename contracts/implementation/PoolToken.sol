//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../vendors/ERC20_Cloneable.sol";
import "../interfaces/IPoolToken.sol";

/// @title The pool token; used for ownership/shares of the underlying tokens of the long/short pool
/// @dev ERC_20_Cloneable contains onlyOwner code implemented for use with the cloneable setup
contract PoolToken is ERC20_Cloneable, IPoolToken {
    // #### Global state

    // #### Functions

    constructor(uint8 _decimals) ERC20_Cloneable("BASE_TOKEN", "BASE", _decimals) {}

    /**
     * @notice Mints pool tokens
     * @param amount Pool tokens to burn
     * @param account Account to burn pool tokens to
     */
    function mint(uint256 amount, address account) external override onlyOwner {
        _mint(account, amount);
    }

    /**
     * @notice Burns pool tokens
     * @param amount Pool tokens to burn
     * @param account Account to burn pool tokens from
     */
    function burn(uint256 amount, address account) external override onlyOwner {
        _burn(account, amount);
    }
}
