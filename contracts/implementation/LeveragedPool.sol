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
    // require(msg.sender == commits[_commitID].owner, "Unauthorized");
    // require(commits[_commitID].amount > 0, "Invalid commit");
    // uint256 amount = commits[_commitID].amount;
    // CommitType commitType = commits[_commitID].commitType;
    // shadowPools[commits[_commitID].commitType] -= amount;
    // emit RemoveCommit(_commitID, amount, commitType);
    // delete commits[_commitID];
    // if (
    //   commitType == CommitType.LongMint || commitType == CommitType.ShortMint
    // ) {
    //   require(
    //     IERC20(quoteToken).transfer(msg.sender, amount),
    //     "Transfer failed"
    //   );
    // }
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
    // Commit memory _commit;
    // for (uint256 i = 0; i < _commitIDs.length; i++) {
    //   _commit = commits[_commitIDs[i]];
    //   require(_commit.amount > 0, "Invalid commit");
    //   // TODO: Double check this
    //   require(
    //     _commit.created + frontRunningInterval < lastPriceTimestamp,
    //     "Commit too new"
    //   );
    //   // Imbalance check.
    //   require(
    //     getRatio(longBalance, shortBalance) <= _commit.maxImbalance,
    //     "Imbalance tolerance exceeded"
    //   );
    //   emit ExecuteCommit(_commitIDs[i]);
    //   // Update shadow pools
    //   shadowPools[_commit.commitType] -= _commit.amount;
    //   delete commits[_commitIDs[i]];
    // if (_commit.commitType == CommitType.LongMint) {
    //   // Update pool balance
    //   longBalance = longBalance.add(_commit.amount);
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
    // }
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
