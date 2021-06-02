// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/ILeveragedPool.sol";
import "./PoolToken.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "hardhat/console.sol";

/*
@title The pool controller contract
*/
contract LeveragedPool is ILeveragedPool, AccessControl, Initializable {
  using SafeMath for uint256;
  using SafeMath for uint128;

  // #### Globals
  // TODO: Rearrange to tight pack these for gas savings
  string public poolCode;

  // Index 0 is the LONG token, index 1 is the SHORT token
  address[2] public tokens;

  // Each balance is the amount of quote tokens in the pair
  uint128 public shortBalance;
  uint128 public longBalance;

  int256 public lastPrice;
  uint256 public lastPriceTimestamp;

  address public quoteToken;
  uint32 public updateInterval;
  uint32 public frontRunningInterval;

  uint16 public fee;
  uint16 public leverageAmount;
  address public feeAddress;

  uint256 public commitIDCounter;
  mapping(uint256 => Commit) public commits;

  mapping(CommitType => uint256) public shadowPools;

  // #### Roles
  /**
  @notice The Updater role is for addresses that can update a pool's price
   */
  bytes32 public constant UPDATER = keccak256("UPDATER");
  /**
  @notice The admin role for the fee holder and updater roles
   */
  bytes32 public constant ADMIN = keccak256("ADMIN");

  /**
  @notice The Fee holder role is for addresses that can change the address that fees go to.
   */
  bytes32 public constant FEE_HOLDER = keccak256("FEE_HOLDER");

  // #### Functions

  function initialize(
    string memory _poolCode,
    int256 _firstPrice,
    uint32 _updateInterval,
    uint32 _frontRunningInterval,
    uint16 _fee,
    uint16 _leverageAmount,
    address _feeAddress,
    address _quoteToken
  ) external override initializer() {
    require(_feeAddress != address(0), "Fee address cannot be 0 address");
    require(_quoteToken != address(0), "Quote token cannot be 0 address");
    require(
      _updateInterval > _frontRunningInterval,
      "Update interval < FR interval"
    );
    // Setup roles
    _setRoleAdmin(UPDATER, ADMIN);
    _setRoleAdmin(FEE_HOLDER, ADMIN);
    _setupRole(UPDATER, msg.sender);
    _setupRole(ADMIN, msg.sender);
    _setupRole(FEE_HOLDER, _feeAddress);

    // Setup variables
    quoteToken = _quoteToken;
    lastPrice = _firstPrice;
    updateInterval = _updateInterval;
    frontRunningInterval = _frontRunningInterval;
    fee = _fee;
    leverageAmount = _leverageAmount;
    feeAddress = _feeAddress;
    lastPriceTimestamp = block.timestamp;
    poolCode = _poolCode;

    // Create pair tokens
    tokens[0] = address(
      new PoolToken(
        string(abi.encodePacked(_poolCode, "-LONG")),
        string(abi.encodePacked("L-", _poolCode))
      )
    );
    tokens[1] = address(
      new PoolToken(
        string(abi.encodePacked(_poolCode, "-SHORT")),
        string(abi.encodePacked("S-", _poolCode))
      )
    );
    emit PoolInitialized(tokens[0], tokens[1], _quoteToken, _poolCode);
  }

  function commit(
    CommitType commitType,
    uint256 maxImbalance,
    uint128 amount
  ) external override {
    require(amount > 0, "Amount must not be zero");
    commitIDCounter += 1;
    commits[commitIDCounter] = Commit({
      commitType: commitType,
      maxImbalance: maxImbalance,
      amount: amount,
      owner: msg.sender,
      created: block.timestamp
    });

    shadowPools[commitType] += amount;

    emit CreateCommit(commitIDCounter, amount, maxImbalance, commitType);

    if (
      commitType == CommitType.LongMint || commitType == CommitType.ShortMint
    ) {
      require(
        IERC20(quoteToken).transferFrom(msg.sender, address(this), amount),
        "Transfer of collateral failed"
      );
    }
    // TODO: finish implementation in TPS-9: executeCommitment
    // else if (commitType == CommitType.LongBurn) {
    //   require(
    //     PoolToken(tokens[0]).burn(amount, msg.sender),
    //     "Transfer of collateral failed"
    //   );
    // } else if (commitType == CommitType.ShortBurn) {
    //   require(
    //     PoolToken(tokens[1]).burn(amount, msg.sender),
    //     "Transfer of collateral failed"
    //   );
    // }
  }

  function uncommit(uint256 _commitID) external override {
    require(msg.sender == commits[_commitID].owner, "Unauthorized");
    require(commits[_commitID].amount > 0, "Invalid commit");

    uint256 amount = commits[_commitID].amount;
    CommitType commitType = commits[_commitID].commitType;

    shadowPools[commits[_commitID].commitType] -= amount;

    emit RemoveCommit(_commitID, amount, commitType);

    delete commits[_commitID];

    if (
      commitType == CommitType.LongMint || commitType == CommitType.ShortMint
    ) {
      require(
        IERC20(quoteToken).transfer(msg.sender, amount),
        "Transfer failed"
      );
    }
    // TODO: finish implementation in TPS-9: executeCommitment
    // else if (commitType == CommitType.LongBurn) {
    //   require(
    //     PoolTokens(tokens[0]).mint(amount, msg.sender),
    //     "Transfer failed"
    //   );
    // } else if (commitType == CommitType.ShortBurn) {
    //   require(
    //     PoolTokens(tokens[1]).mint(amount, msg.sender),
    //     "Transfer failed"
    //   );
    // }
  }

  function executeCommitment(uint256[] memory _commitIDs) external override {
    Commit memory _commit;
    for (uint256 i = 0; i < _commitIDs.length; i++) {
      _commit = commits[_commitIDs[i]];
      require(_commit.amount > 0, "Invalid commit");
      // TODO: Double check this
      require(
        _commit.created + frontRunningInterval < lastPriceTimestamp,
        "Commit too new"
      );
      // Imbalance check.

      require(
        getRatio(longBalance, shortBalance) <= _commit.maxImbalance,
        "Imbalance tolerance exceeded"
      );
      emit ExecuteCommit(_commitIDs[i]);

      // Update shadow pools
      shadowPools[_commit.commitType] -= _commit.amount;
      delete commits[_commitIDs[i]];

      // if (_commit.commitType == CommitType.LongMint) {
      //   // Update pool balance
      //   longBalance += _commit.amount;
      //   // Issue pool tokens
      //   PoolToken(tokens[0]).mint(
      //     getAmountOut(
      //       getRatio(
      //         uint128(IERC20(tokens[0]).totalSupply()),
      //         uint128(longBalance.sub(_commit.amount))
      //       ),
      //       _commit.amount
      //     ),
      //     _commit.owner
      //   );
      // } else if (_commit.commitType == CommitType.ShortMint) {
      //   // Update pool balance
      //   shortBalance += _commit.amount;
      //   // Issue pool tokens
      //   PoolToken(tokens[1]).mint(
      //     getAmountOut(
      //       getRatio(
      //         uint128(IERC20(tokens[1]).totalSupply()),
      //         uint128(shortBalance.sub(_commit.amount))
      //       ),
      //       _commit.amount
      //     ),
      //     _commit.owner
      //   );
      // }
      // else if (_commit.commitType == CommitType.LongBurn) {
      //   uint256 amountOut =
      //     getAmountOut(
      //       getRatio(
      //         uint128(IERC20(tokens[0]).totalSupply()),
      //         uint128(longBalance.sub(_commit.amount))
      //       ),
      //       _commit.amount
      //     );
      //   // Update pool balance
      //   longBalance -= uint128(amountOut);

      //   // remit quote tokens
      //   require(
      //     IERC20(quoteToken).transfer(_commit.owner, amountOut),
      //     "Transfer of collateral failed"
      //   );
      // }
      // else if (_commit.commitType == CommitType.ShortBurn) {
      //   // Update pool balance
      //   // remit quote tokens
      // }
    }
  }

  function getRatio(uint128 _numerator, uint128 _denominator)
    public
    pure
    override
    returns (uint256)
  {
    // Catch the divide by zero error.
    if (_denominator == 0) {
      return 0;
    }
    // Create a 128.128 fixed point number
    return (uint256(_numerator) * 10**(38)).div(uint256(_denominator));
  }

  // TODO: Need to stress test this as well as the getRatio improvements.
  function getAmountOut(uint256 ratio, uint128 amountIn)
    public
    view
    override
    returns (uint256)
  {
    require(amountIn > 0, "Invalid amount");
    if (ratio == 0 || ratio == 1) {
      return amountIn;
    }

    // Ratio is the number of tokens user should receive for each token in amountIn

    // If we're dealing with a ratio < 1
    if (ratio < 10**38) {
      return amountIn.mul(ratio);
    }

    return muldiv(ratio, amountIn, 10**(38));
  }

  /**
    @notice Remco Bloeman's muldiv function, see https://2π.com/21/muldiv/
    @param a Multiplier
    @param b Multiplicand
    @param denominator What to divide the > 2^256 product by
    @return result The final result for a * b / c taking into account overflow for the product of a * b
 */
  function muldiv(
    uint256 a,
    uint256 b,
    uint256 denominator
  ) internal pure returns (uint256 result) {
    // Handle division by zero
    require(denominator > 0);

    // 512-bit multiply [prod1 prod0] = a * b
    // Compute the product mod 2**256 and mod 2**256 - 1
    // then use the Chinese Remiander Theorem to reconstruct
    // the 512 bit result. The result is stored in two 256
    // variables such that product = prod1 * 2**256 + prod0
    uint256 prod0; // Least significant 256 bits of the product
    uint256 prod1; // Most significant 256 bits of the product
    assembly {
      let mm := mulmod(a, b, not(0))
      prod0 := mul(a, b)
      prod1 := sub(sub(mm, prod0), lt(mm, prod0))
    }

    // Short circuit 256 by 256 division
    // This saves gas when a * b is small, at the cost of making the
    // large case a bit more expensive. Depending on your use case you
    // may want to remove this short circuit and always go through the
    // 512 bit path.

    if (prod1 == 0) {
      assembly {
        result := div(prod0, denominator)
      }
      return result;
    }

    ///////////////////////////////////////////////
    // 512 by 256 division.
    ///////////////////////////////////////////////

    // Handle overflow, the result must be < 2**256
    require(prod1 < denominator);

    // Make division exact by subtracting the remainder from [prod1 prod0]
    // Compute remainder using mulmod
    // Note mulmod(_, _, 0) == 0
    uint256 remainder;
    assembly {
      remainder := mulmod(a, b, denominator)
    }
    // Subtract 256 bit number from 512 bit number
    assembly {
      prod1 := sub(prod1, gt(remainder, prod0))
      prod0 := sub(prod0, remainder)
    }

    // Factor powers of two out of denominator
    // Compute largest power of two divisor of denominator.
    // Always >= 1 unless denominator is zero, then twos is zero.
    uint256 twos = -denominator & denominator;
    // Divide denominator by power of two
    assembly {
      denominator := div(denominator, twos)
    }

    // Divide [prod1 prod0] by the factors of two
    assembly {
      prod0 := div(prod0, twos)
    }
    // Shift in bits from prod1 into prod0. For this we need
    // to flip `twos` such that it is 2**256 / twos.
    // If twos is zero, then it becomes one
    assembly {
      twos := add(div(sub(0, twos), twos), 1)
    }
    prod0 |= prod1 * twos;

    // Invert denominator mod 2**256
    // Now that denominator is an odd number, it has an inverse
    // modulo 2**256 such that denominator * inv = 1 mod 2**256.
    // Compute the inverse by starting with a seed that is correct
    // correct for four bits. That is, denominator * inv = 1 mod 2**4
    // If denominator is zero the inverse starts with 2
    uint256 inv = (3 * denominator) ^ 2;
    // Now use Newton-Raphson itteration to improve the precision.
    // Thanks to Hensel's lifting lemma, this also works in modular
    // arithmetic, doubling the correct bits in each step.
    inv *= 2 - denominator * inv; // inverse mod 2**8
    inv *= 2 - denominator * inv; // inverse mod 2**16
    inv *= 2 - denominator * inv; // inverse mod 2**32
    inv *= 2 - denominator * inv; // inverse mod 2**64
    inv *= 2 - denominator * inv; // inverse mod 2**128
    inv *= 2 - denominator * inv; // inverse mod 2**256
    // If denominator is zero, inv is now 128

    // Because the division is now exact we can divide by multiplying
    // with the modular inverse of denominator. This will give us the
    // correct result modulo 2**256. Since the precoditions guarantee
    // that the outcome is less than 2**256, this is the final result.
    // We don't need to compute the high bits of the result and prod1
    // is no longer required.
    result = prod0 * inv;
    return result;
  }

  function executePriceChange(uint256 endPrice) external override {
    lastPriceTimestamp = block.timestamp;
  }

  function updateFeeAddress(address account) external override {}

  // #### Modifiers
  /**
    @notice Requires caller to have been granted the UPDATER role. Use this for functions that should be restricted to the PoolKeeper
     */
  modifier onlyUpdater {
    require(hasRole(UPDATER, msg.sender));
    _;
  }

  /** 
  @notice Requires caller to have been granted the FEE_HOLDER role.
  */
  modifier onlyFeeHolder {
    require(hasRole(FEE_HOLDER, msg.sender));
    _;
  }
}
