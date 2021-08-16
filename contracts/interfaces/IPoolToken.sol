pragma solidity 0.8.6;

interface IPoolToken {
    /**
    * @notice Mints pool tokens
    * @param amount of pool tokens to mint
    * @param account that the pool tokens are being minted to
    */
    function mint(uint256 amount, address account) external returns (bool);

    /**
    * @notice Burns pool tokens
    * @param amount of pool tokens to burn
    * @param account that the pool tokens are being burned from
    */
    function burn(uint256 amount, address account) external returns (bool);
}