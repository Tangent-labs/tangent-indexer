import { Prisma, PointsBotAction as PrismaPointsBotAction, ErrorLevel as PrismaErrorLevel } from "@prisma/client"
import { AddressLike } from "ethers"

export type MarketType = "ConvexFxn" | "ConvexCrv" | "Pendle PT"

export type CurverRegistry = "factory" | "main" | "crypto" | "factory-crypto" | "factory-crvusd" | "factory-tricrypto" | "factory-stable-ng"

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
  | "error"

export type CurveQuote = {
  _route: string[] // address[11]
  _swap_params: number[][]
  _amount: bigint
  _pools: string[] // address[5]
}

export type QuoteLiquidationRouterIn = {
  quotes: CurveQuote[]
}

/**
 * Route parameters for liquidation swaps
 */
export type LiquidationRouteParams = {
  routeAddresses: string[]
  swapParamsFull: number[][]
}

/**
 * A single liquidation route with display name and swap parameters
 * Note: The input token address is the key in the parent object, not a property of the route
 */
export type LiquidationRoute = {
  display: string // Human-readable route description
  params: LiquidationRouteParams
}

/**
 * Structure of the successRoutes JSON file
 * Nested object structure: success[inputTokenAddress][outputTokenAddress] = LiquidationRoute[]
 * The input token address (in) is the key, not a property of the route
 */
export type SuccessRoutes = {
  success: {
    [inputTokenAddress: string]: {
      [outputTokenAddress: string]: LiquidationRoute[]
    }
  }
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
  voterAddress: string
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

export type PriceApiInfo = {
  address: string
  price: number
}

export type PriceApiError = {
  httpCode?: number
  reason: string
  api: string
}

export type PriceApiResult = {
  prices: PriceApiInfo[]
  error?: PriceApiError
}

export type PriceSource = Prisma.price_sourceGetPayload<{}>
export type PriceSourceCreate = Prisma.price_sourceCreateManyInput

export type AddressesJson = {
  utilities: {
    controlTower: string
    rewardAccumulator: string
    zappingProxy: string
    marketCreator: string
    irCalculator: string
    pegKeeperRegulator: string
  }
  tokens: {
    USG: string
    sUSG: string
    TAN: string
    sTAN: string
    vsTAN: string
  }
  implementations: {
    convexCrvMarket: string
    convexFxnMarket: string
    basicERC20Market: string
  }
  oracles: { [tokenName: string]: string }
  pegKeepers: { [poolName: string]: string }
  markets: { marketAddress: string; collatName: string; collatAddress: string; marketType: string }[]
}
export type NotificationBotErrorLevel = PrismaErrorLevel

export type NotificationBotAction = PrismaPointsBotAction

export const POINTS_BOT_ACTIONS: Record<PrismaPointsBotAction, PrismaPointsBotAction> = {
  POINTS_GENERAL: "POINTS_GENERAL",
  POINTS_FETCH_PRICES: "POINTS_FETCH_PRICES",
  POINTS_PROCESS_USER_TASK: "POINTS_PROCESS_USER_TASK",
  POINTS_CALCULATE_POINTS: "POINTS_CALCULATE_POINTS",
  POINTS_PROCESS_VOTE_ONCHAIN: "POINTS_PROCESS_VOTE_ONCHAIN",
  POINTS_PROCESS_VOTE: "POINTS_PROCESS_VOTE",
  POINTS_INDEXER: "POINTS_INDEXER",
} as const

export type NotificationErrorLevel = PrismaErrorLevel
export const NOTIFICATION_LEVEL = {
  INFO: "INFO",
  WARNING: "WARNING",
  ERROR: "ERROR",
} as const

export type NotificationMessage = {
  process: string
  error: PriceApiError | Error | any
  level?: NotificationErrorLevel
  message?: string
  action: NotificationBotAction
}
