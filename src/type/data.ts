import { AddressLike } from "ethers"

export type MarketType = "ConvexFxn" | "ConvexCrv" | "NoSociabilization"

export type LiquidationUserInInfo = { account: AddressLike; market: AddressLike }

export type LiquidationMarketOutInfo = {
  maxLTV: bigint
  liquidationThreshold: bigint
  collateralUSDPrice: bigint
  oracleDecimals: bigint
}

export type LiquidationAccountOutInfo = {
  healthRatio: bigint
  positionDebt: bigint
  positionValue: bigint
}
export type LiquidationMarketAccountOutInfo = {
  markets: LiquidationMarketOutInfo[]
  accounts: LiquidationAccountOutInfo[]
}

export type LiquidationUserInfo = LiquidationAccountOutInfo & LiquidationUserInInfo

export type LiquidationAnalyseInfo = {
  hardLiquidationList?: LiquidationUserInfo[]
  softLiquidationList?: LiquidationUserInfo[]
  notDebtorAnymoreList?: LiquidationUserInfo[]
}

export type LiquidationBotLogAction =
  | "liquidation_params"
  | "liquidation_bad_debt_execution"
  | "on_chain_data"
  | "liquidation_analysis"
  | "clean_debtors"
  | "liquidation_execution"
