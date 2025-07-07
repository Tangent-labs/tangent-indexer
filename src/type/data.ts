import { AddressLike } from "ethers"

export type MarketType = "ConvexFxn" | "ConvexCrv" | "Pendle PT"

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
  market: AddressLike
  healthRatio: bigint
  userDebt: bigint
  positionValue: bigint
  collateralBalance: bigint
}
export type LiquidationMarketAccountOutInfo = {
  markets: LiquidationMarketOutInfo[]
  accounts: LiquidationAccountOutInfo[]
}

export type LiquidationUserInfo = LiquidationAccountOutInfo & LiquidationUserInInfo
export type LiquidationUserFullInfo = LiquidationUserInfo & { collatToken: AddressLike }

export type LiquidationAnalyseInfo = {
  seizingList?: LiquidationUserFullInfo[]
  liquidationList?: LiquidationUserFullInfo[]
  notDebtorAnymoreList?: LiquidationUserInInfo[]
}

export type LiquidationBotLogAction =
  | "check_context"
  | "liquidation_params"
  | "liquidation_bad_debt_execution"
  | "on_chain_data"
  | "liquidation_analysis"
  | "liquidation_prioritization"
  | "clean_debtors"
  | "liquidation_execution"
  | "end_execution"

export type CurveQuote = {
  _route: string[] // address[11]
  _swap_params: number[][]
  _amount: bigint
  _pools: string[] // address[5]
}

export type QuoteLiquidationRouterIn = {
  quotes: CurveQuote[]
}

// Snapshot Proposal Types
export type RewardedChoice = {
  choice: string
  index: number
  rewardIndex: number
}

export type Reward = {
  task: string
  value: string
}

export type ValidatedTask = {
  task: string
  value: string
  validationDate?: Date
  voterAddress?: string
  votingPower?: number
  proposalId?: string
}

export type Proposal = {
  id: string
  title: string
  start: number
  end: number
  created: number
  state: string
  snapshot: string
  type: string
  rewarded?: RewardedChoice[]
  organizationRewards?: Reward[]
  excludedVoters?: string[]
}

export type Vote = {
  id: string
  voter: string
  created: number
  choice: number | string | number[] | Record<string, number>
  vp: number
  reason?: string
  proposal: {
    id: string
    title: string
  }
}

export type Organization = {
  key: string
  value: string
  title: string
  rewards: Reward[]
  excludedVoters?: string[]
}

export type OrganizationConfig = {
  key: string
  value: string
  title: string
  rewards: Reward[]
  excludedVoters: string[]
}

export type RewardedChoiceOption = {
  key: string
  value: string
}
