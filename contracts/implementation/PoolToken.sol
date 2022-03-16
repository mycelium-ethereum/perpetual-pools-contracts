//SPDX-License-Identifier: CC-BY-NC-ND-4.0
pragma solidity 0.8.7;

import "../vendors/ERC20_Cloneable.sol";
import "../interfaces/IPoolToken.sol";

/// @title The pool token; used for ownership/shares of the underlying tokens of the long/short pool
/// @dev ERC_20_Cloneable contains onlyOwner code implemented for use with the cloneable setup
contract PoolToken is ERC20_Cloneable, IPoolToken {
    // #### Functions
    constructor(uint8 _decimals) ERC20_Cloneable("BASE_TOKEN", "BASE", _decimals) {}

    /**
     * @notice Mints pool tokens
     * @param account Account to mint pool tokens to
     * @param amount Pool tokens to mint
     */
    function mint(address account, uint256 amount) external override onlyOwner {
        _mint(account, amount);
    }

    /**
     * @notice Burns pool tokens
     * @param account Account to burn pool tokens from
     * @param amount Pool tokens to burn
     */
    function burn(address account, uint256 amount) external override onlyOwner {
        _burn(account, amount);
    }
}
