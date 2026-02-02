import { NumMap } from "../../services/boost/types.js"
import { CurverRegistry } from "../../type/data.js"

export type USGContractsIn = {
  rewardAccumulator: string
  irCalculator: string
  usg: string
  sUSG: string
  usgOracle: string
  _marketViewer: string
}

export type APR = {
  token: string
  amountPerYear: bigint
}
export type GlobalData = {
  marketAddress: string
  totalStakedAmount: bigint
  totalStakedUSD: bigint
  totalDebt: bigint
  badDebt: bigint
  oraclePrice: bigint
  irApr: bigint
  rewardCut: bigint
  rewardTokens: string[]
}
export type StreamingData = {
  token: string
  amountPerYear: bigint
}
export type TVLStreamingData = {
  totalSupplyUnderlying: bigint
  streamingData: StreamingData[]
}
export type TVLAprs = {
  globalData: GlobalData
  currentAPR: StreamingData[]
  projectedAPR: TVLStreamingData
}

export type USGInfoOut = {
  circulatingUsg: bigint
  UsgPrice: bigint
  sUsgSupply: bigint
  usgStakedOnSgUsd: bigint
}
export type KeeperData = {
  keeper: string
  lp: string
  lpBalance: bigint
  virtualPrice: bigint
  coin0: string
  coin1: string
}
export type KeeperIn = {
  keeper: string
  lp: string
}

export type WStableData = {
  wStable: string
  stable: string
  totalSupply: bigint
}

export type USGIndexingGlobalDataOut = {
  timestamp: bigint
  marketData: TVLAprs[]
  usgInfo: USGInfoOut
  keepersData: KeeperData[]
  wStablesData: WStableData[]
}

export type CurveApiReturn = {
  data?: {
    poolList: { address: string; latestWeeklyApy: number }[]
  }
  error?: any
}
export type StakeDaoApiReturn = {
  Vault?: {
    address: string
    gauge: {
      aprDetails: { apr: string; asset: { address: string; symbol: string } }[]
    }
    asset: {
      address: string
    }
  }[]
  error?: any
}

export type CurveFactoryStableNGApiReturn = {
  data?: {
    poolData: { address: string; gaugeRewards: { tokenAddress: string; symbol: string; apy: number }[] }[]
  }
  error?: any
}

export type PendleApiReturn = {
  markets?: { underlyingAsset: string; expiry: string; pt: string; address: string; details: { impliedApy: number }; yt: string }[]
  error?: any
}

export type ConvexFxnApiReturn = {
  pools?: { augmentedPoolData: { curvePoolData?: { address: string }; rewardCoins: { address: string }[]; rewardAprs: number[] }[] }
  error?: any
}

export type Prices = { [address: string]: { decimals: number; symbol: string; price: number; timestamp: number; confidence: number } }

export const APR_TYPE: { [name: string]: number } = {
  "Convex CRV": 0,
  "Convex FXN": 1,
  "Pendle PT": 2,
  "StakeDao Vault": 3,
  "Curve Gauge": 4,
}

export type Aprs = { current: NumMap; projected: NumMap }

export type CurvePoolData = {
  id: string
  address: string
  name: string
  usdTotal: number
  totalSupply: number
}

export type CurvePoolListApiResult = {
  success: boolean
  data: {
    poolList: [
      {
        address: string
        type: CurverRegistry
      },
    ]
  }
}

export type CurvePriceApiResult = {
  success: boolean
  data: {
    poolData: CurvePoolData[]
  }
}

export type TokenPriceInfo = {
  decimals: number
  symbol: string
  price: number
  timestamp: number // usually a unix timestamp (seconds since epoch)
  confidence: number // confidence score (0–1)
}
export type LlamaPriceApiResult = {
  coins: {
    [tokenId: string]: TokenPriceInfo
  }
}

export type PendlePriceApiResult = {
  prices: {
    [address: string]: number
  }
}
