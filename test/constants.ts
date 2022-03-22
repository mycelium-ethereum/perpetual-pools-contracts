import { ethers } from "hardhat"
import { BigNumberish } from "ethers"

export const MARKET = "AUD/USD"
export const ORACLE = "0x77F9710E7d0A19669A13c055F62cd80d313dF022"
export const ORACLE_2 = "0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5"
export const MARKET_2 = "GBP/USD"
export const OPERATOR_ROLE = "OPERATOR"
export const ADMIN_ROLE = "ADMIN"
export const UPDATER_ROLE = "UPDATER"
export const FEE_HOLDER_ROLE = "FEE_HOLDER"

export const MARKET_CODE = "TEST/MARKET"
export const POOL_CODE = "CODE1"
export const POOL_CODE_2 = "CODE2"

export const DEFAULT_MINT_AMOUNT = ethers.utils.parseEther("100000000")
export const DEFAULT_FEE = "0"

export const SHORT_MINT = 0
export const SHORT_BURN = 1
export const LONG_MINT = 2
export const LONG_BURN = 3
export const LONG_BURN_THEN_MINT = 4
export const SHORT_BURN_THEN_MINT = 5

export const DEFAULT_MAX_LEVERAGE = 10
export const DEFAULT_MIN_LEVERAGE = 1
export const GAS_OVERHEAD: BigNumberish = 80195
