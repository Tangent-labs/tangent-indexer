import { AbiCoder, id } from "ethers"

export const REPAY = "Repay(address,address,uint256,uint256)"
export const REPAY_AND_WITHDRAW = "RepayAndWithdraw(address,uint256,uint256,uint256)"
export const ZAP_REPAY = "ZapRepay(address,address,uint256,uint256,address,uint256)"
export const ZAP_REPAY_AND_WITHDRAW = "ZapRepayAndWithdraw(address,uint256,uint256,uint256,address,uint256)"
export const WITHDRAW = "Withdraw(address,uint256)"

export const DEPOSIT = "Deposit(address,uint256)"
export const BORROW = "Borrow(address,address,uint256,uint256)"
export const ZAP_DEPOSIT = "ZapDeposit(address,uint256,address,uint256)"
export const DEPOSIT_AND_BORROW = "DepositAndBorrow(address,uint256,uint256,uint256)"
export const ZAP_DEPOSIT_AND_BORROW = "ZapDepositAndBorrow(address,uint256,uint256,uint256,address,uint256)"

export const LEVERAGE = "Leverage(address,uint256,uint256,uint256,uint256)"
export const ZAP_LEVERAGE = "ZapLeverage(address,uint256,uint256,uint256,uint256,uint256,address,uint256)"

export const LIQUIDATE = "Liquidate(address,uint256,uint256,uint256,uint256,address)"
export const SELF_LIQUIDATE = "SelfLiquidate(address,uint256,uint256,uint256,address)"
export const SEIZE_COLLATERAL = "SeizeCollateral(address,uint256,uint256)"

export const MIGRATE_FROM = "MigrateFrom(address,uint256,uint256,uint256,uint256)"
export const MIGRATE_TO = "MigrateTo(address,uint256,uint256,uint256)"

export const MARKET_CONVEX_CRV_CREATED = "MarketConvexCrvCreated(address,string)"
export const MARKET_CONVEX_FXN_CREATED = "MarketConvexFxnCreated(address,string)"
export const BASIC_ERC20_MARKET_CREATED = "BasicERC20MarketCreated(address,string)"
export const MARKET_STAKEDAO_VAULT_V2_CREATED = "MarketStakeDaoVaultV2Created(address,string)"
export const MARKET_CURVE_GAUGE_CREATED = "MarketCurveGaugeCreated(address,string)"

export const TRANSFER = "Transfer(address,address,uint256)"
export const STAKED = "Staked(address,uint256)"
export const WITHDRAWN = "Withdrawn(address,uint256)"

export const VOTE_FOR_GAUGE = "VoteForGauge(uint256,address,address,uint256)"
export const CHECKPOINT_IR = "CheckpointIR(address,uint256,unit256)"

// Event signatures and topics
export const EVENT_TOPICS = {
  [id(REPAY)]: "Repay",
  [id(REPAY_AND_WITHDRAW)]: "RepayAndWithdraw",
  [id(ZAP_REPAY)]: "ZapRepay",
  [id(ZAP_REPAY_AND_WITHDRAW)]: "ZapRepayAndWithdraw",
  [id(WITHDRAW)]: "Withdraw",
  [id(DEPOSIT)]: "Deposit",
  [id(BORROW)]: "Borrow",
  [id(ZAP_DEPOSIT)]: "ZapDeposit",
  [id(DEPOSIT_AND_BORROW)]: "DepositAndBorrow",
  [id(ZAP_DEPOSIT_AND_BORROW)]: "ZapDepositAndBorrow",
  [id(LEVERAGE)]: "Leverage",
  [id(ZAP_LEVERAGE)]: "ZapLeverage",
  [id(LIQUIDATE)]: "Liquidate",
  [id(SELF_LIQUIDATE)]: "SelfLiquidate",
  [id(SEIZE_COLLATERAL)]: "SeizeCollateral",
  [id(MIGRATE_FROM)]: "MigrateFrom",
  [id(MIGRATE_TO)]: "MigrateTo",
  [id(TRANSFER)]: "Transfer",
  [id(STAKED)]: "Staked",
  [id(WITHDRAWN)]: "Withdrawn",

  // Market Creation
  [id(MARKET_CONVEX_CRV_CREATED)]: "MarketConvexCrvCreated",
  [id(MARKET_CONVEX_FXN_CREATED)]: "MarketConvexFxnCreated",
  [id(BASIC_ERC20_MARKET_CREATED)]: "BasicERC20MarketCreated",
  [id(MARKET_STAKEDAO_VAULT_V2_CREATED)]: "MarketStakeDaoVaultV2Created",
  [id(MARKET_CURVE_GAUGE_CREATED)]: "MarketCurveGaugeCreated",
}

export function encodeRepay(repayer: string, repaidAmount: bigint, newUserDebtShares: bigint) {
  return AbiCoder.defaultAbiCoder().encode(["address", "uint256", "uint256"], [repayer, repaidAmount, newUserDebtShares])
}

export function encodeBorrow(receiver: string, borrowedAmount: bigint, newUserDebtShares: bigint) {
  return AbiCoder.defaultAbiCoder().encode(["address", "uint256", "uint256"], [receiver, borrowedAmount, newUserDebtShares])
}

export function encodeDeposit(stakedAmount: bigint) {
  return AbiCoder.defaultAbiCoder().encode(["uint256"], [stakedAmount])
}
export function encodeDepositAndBorrow(stakedAmount: bigint, borrowedAmount: bigint, newUserDebtShares: bigint) {
  return AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "uint256"], [stakedAmount, borrowedAmount, newUserDebtShares])
}

export function encodeTransfer(from: string, to: string, amount: bigint) {
  return AbiCoder.defaultAbiCoder().encode(["address", "address", "uint256"], [from, to, amount])
}

export function encodeWithdraw(withdrawnAmount: bigint) {
  return AbiCoder.defaultAbiCoder().encode(["uint256"], [withdrawnAmount])
}

export function encodeRepayAndWithdraw(repaidAmount: bigint, withdrawnAmount: bigint, debtShares: bigint) {
  return AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "uint256"], [repaidAmount, withdrawnAmount, debtShares])
}

export function encodeZapDeposit(stakedAmount: bigint, tokenIn: string, amountIn: bigint) {
  return AbiCoder.defaultAbiCoder().encode(["uint256", "address", "uint256"], [stakedAmount, tokenIn, amountIn])
}

export function encodeZapDepositAndBorrow(stakedAmount: bigint, borrowedAmount: bigint, debtShares: bigint, tokenIn: string, amountIn: bigint) {
  return AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "uint256", "address", "uint256"],
    [stakedAmount, borrowedAmount, debtShares, tokenIn, amountIn]
  )
}

export function encodeZapRepay(repayer: string, repaidAmount: bigint, debtShares: bigint, tokenIn: string, amountIn: bigint) {
  return AbiCoder.defaultAbiCoder().encode(["address", "uint256", "uint256", "address", "uint256"], [repayer, repaidAmount, debtShares, tokenIn, amountIn])
}

export function encodeZapRepayAndWithdraw(withdrawnAmount: bigint, repaidAmount: bigint, debtShares: bigint, tokenIn: string, amountIn: bigint) {
  return AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "uint256", "address", "uint256"],
    [withdrawnAmount, repaidAmount, debtShares, tokenIn, amountIn]
  )
}

export function encodeLeverage(stakedAmount: bigint, collatBought: bigint, borrowedAmount: bigint, debtShares: bigint) {
  return AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "uint256", "uint256"], [stakedAmount, collatBought, borrowedAmount, debtShares])
}

export function encodeZapLeverage(
  stakedAmount: bigint,
  collatZapDeposit: bigint,
  collatLeverage: bigint,
  borrowedAmount: bigint,
  debtShares: bigint,
  tokenIn: string,
  amountIn: bigint
) {
  return AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "uint256", "uint256", "uint256", "address", "uint256"],
    [stakedAmount, collatZapDeposit, collatLeverage, borrowedAmount, debtShares, tokenIn, amountIn]
  )
}

export function encodeLiquidate(repaidAmount: bigint, debtShares: bigint, fee: bigint, collateralLiquidated: bigint, liquidator: string) {
  return AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "uint256", "uint256", "address"],
    [repaidAmount, debtShares, fee, collateralLiquidated, liquidator]
  )
}

export function encodeSelfLiquidate(repaidAmount: bigint, debtShares: bigint, collateralLiquidated: bigint, liquidator: string) {
  return AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "uint256", "address"], [repaidAmount, debtShares, collateralLiquidated, liquidator])
}

export function encodeSeizeCollateral(badDebt: bigint, collateralSeized: bigint) {
  return AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [badDebt, collateralSeized])
}
