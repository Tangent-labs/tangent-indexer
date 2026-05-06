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
  maxMarketDebt: bigint
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
  blockNumber: bigint
  blockTimestamp: bigint
}

export type LiquidationUserInfo = LiquidationAccountOutInfo & LiquidationUserInInfo
export type LiquidationUserFullInfo = LiquidationUserInfo & {
  collatToken: AddressLike
  // Market info from LiquidationMarketOutInfo
  maxLTV?: bigint
  liquidationThreshold?: bigint
  collateralUSDPrice?: bigint
  oracleDecimals?: bigint
}

/**
 * Serialized version of LiquidationUserFullInfo for queue storage (BigInt as strings)
 */
export type SerializedLiquidationUserFullInfo = Omit<LiquidationUserFullInfo, "healthRatio" | "userDebt" | "positionValue" | "collateralBalance"> & {
  healthRatio: string
  userDebt: string
  positionValue: string
  collateralBalance: string
} & { type: "seizing" | "liquidation"; executionKey: string }

export type SerializedLiquidationHeartbeatJob = {
  type: "heartbeat"
  executionKey: string
  createdAt: string
}

export type SerializedLiquidationQueueJob = SerializedLiquidationUserFullInfo | SerializedLiquidationHeartbeatJob

export type LiquidationAnalyseInfo = {
  seizingList?: LiquidationUserFullInfo[]
  liquidationList?: LiquidationUserFullInfo[]
}

/**
 * Router type used for liquidation
 */
export type RouterType = "curve" | "pendle" | "enso"

export type LiquidationEstimateInfo = {
  // Swap info needed to call liquidate on the contract
  account: AddressLike
  collatToLiquidate: bigint
  minTgUSDOut: bigint
  liquidationCall: {
    routerCall: string // bytes encoded as hex string
    routerAddress: string // address of the router to use (Curve or Pendle)
  }
  // Additional estimate information
  expectedOutput: bigint
  slippageBps: bigint
  gasEstimate: {
    gasLimit: bigint
    eth: number
  }
  grossProfit: bigint
  routerType: RouterType
}

/**
 * Data extracted from Liquidate event after successful liquidation
 */
export type LiquidationExecutionResult = {
  repaidAmount: bigint
  debtShares: bigint
  fee: bigint
  collateralLiquidated: bigint
  liquidator: string
  transactionHash: string
  /** Profit from liquidation: repaidAmount - userDebt (can be negative) */
  liquidationProfit: bigint
}

export type LiquidationBotLogAction =
  | "liquidation_preparation"
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
  routerCall?: string
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
export type ScoringChoice = {
  id: bigint
  choice_name: string
  snapshot_organisation_id: bigint
  vote_task_id: bigint
  choiceIndex: number
}

export type Reward = {
  task: string
  value: string
}

export type ValidatedVotes = {
  taskId: bigint
  voterAddress: string
  votingPower: number
  proposalId: string
  date: Date
}

export type Proposal = {
  id: string
  title: string
  start: number
  end: number
  created: number
  state: string
  snapshot: number
  type: string
  scoringChoices: ScoringChoice[]
  excludedVoters: string[]
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
  lps: { [lpName: string]: string }
  utilities: {
    controlTower: string
    rewardAccumulator: string
    zappingProxy: string
    marketCreator: string
    irCalculator: string
    pegKeeperRegulator: string
    pendlePTRouter: string
    marketViewer: string
  }
  tokens: {
    USG: string
    sUSG: string
    TAN?: string
    sTAN?: string
    vsTAN?: string
  }
  implementations: {
    convexCrvMarket: string
    convexFxnMarket: string
    basicERC20Market: string
  }
  oracles: {
    chainlink: { [tokenName: string]: string }
    coinFromCurveLp: { [tokenName: string]: string }
    duoPoolStable: { [tokenName: string]: string }
    pendlePT: { [tokenName: string]: string }
    USG: string
  }
  pegKeepers: { [poolName: string]: string }
  wStables: { [poolName: string]: string }
  markets: { marketAddress: string; marketName: string; collatAddress: string; marketType: string; collatDecimals?: number; logoURI?: string }[]
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

// ============================================
// Pendle Routing Types
// ============================================

/**
 * Configuration for a Pendle pool used in routing
 */
export type PendlePoolConfig = {
  MARKET: string // Pendle market address
  PT: string // Principal Token address
  SY: string // Standardized Yield token address
  YT: string // Yield Token address
  UNDERLYING_IN: string[] // Tokens that can be swapped into this PT
  UNDERLYING_OUT: string[] // Tokens that can be received when redeeming PT
}

/**
 * Quote data for swapping SY to PT (token → PT direction)
 */
export type PendleSYToPTQuote = {
  market: string
  pt: string
  sy: string
  underlyingIn: string
  tokenInAmount: bigint
}

/**
 * Quote data for swapping PT to SY (PT → token direction)
 */
export type PendlePTToSYQuote = {
  market: string
  pt: string
  sy: string
  underlyingOut: string
  ptAmount: bigint
}

/**
 * Parameters for quoting Token to PT swap via chainview
 */
export type QuoteTokenToPTParams = {
  curveRouterData: CurveQuote
  syToPTData: PendleSYToPTQuote
}

/**
 * Parameters for quoting PT to Token swap via chainview
 * Note: CurveRouteParamsOnly doesn't include _amount as it's derived from PT redemption
 */
export type QuotePTToTokenParams = {
  ptToSYData: PendlePTToSYQuote
  curveRouterData: {
    _route: string[]
    _swap_params: number[][]
    _pools: string[]
  }
}

/**
 * Output from PT to Token quote with price impact
 */
export type QuotePTToTokenOut = {
  quote: bigint
  priceImpact: bigint
}

/**
 * Result of a route evaluation with quote and price impact
 */
export type RouteEvaluationResult = {
  route: LiquidationRoute | null
  amount: bigint
  priceImpact: number
  routerAddress?: string
}

/**
 * Result of a Pendle route evaluation
 */
export type PendleRouteResult = {
  route: LiquidationRoute | null
  pendleData: PendlePTToSYQuote
  amount: bigint
  priceImpact: number
}
