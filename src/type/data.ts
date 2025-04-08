import { AddressLike } from "ethers"

export type MarketType = "ConvexFxn" | "ConvexCrv" | "NoSociabilization"

export type LiquidationUserInInfo = { account: AddressLike; market: AddressLike }

export type LiquidationMarketOutInfo = {
  maxLTV: bigint
  liquidationThreshold: bigint
  collateralUSDPrice: bigint
  oracleDecimals: bigint
  collatToken: AddressLike
  market: AddressLike
}

export type LiquidationAccountOutInfo = {
  healthRatio: bigint
  positionDebt: bigint
  positionValue: bigint
  market: AddressLike
}
export type LiquidationMarketAccountOutInfo = {
  markets: LiquidationMarketOutInfo[]
  accounts: LiquidationAccountOutInfo[]
}

export type LiquidationUserInfo = LiquidationAccountOutInfo & LiquidationUserInInfo
export type LiquidationUserFullInfo = LiquidationUserInfo & { collatToken: AddressLike }

export type LiquidationAnalyseInfo = {
  hardLiquidationList?: LiquidationUserInfo[]
  softLiquidationList?: LiquidationUserFullInfo[]
  notDebtorAnymoreList?: LiquidationUserInfo[]
}

export type LiquidationBotLogAction =
  | "liquidation_params"
  | "liquidation_bad_debt_execution"
  | "on_chain_data"
  | "liquidation_analysis"
  | "clean_debtors"
  | "liquidation_execution"

export type CurveQuote = {
  _route: string[] // address[11]
  _swap_params: number[][]
  _amount: bigint
}

export type QuoteLiquidationRouterIn = {
  curveQuote: CurveQuote
}
