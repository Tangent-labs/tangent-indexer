import { NumMap } from "../../services/boost/types.js"
import { CurverRegistry } from "../../type/data.js"

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

export type USGIndexingGlobalDataOut = {
  timestamp: bigint
  marketData: TVLAprs[]
  usgInfo: USGInfoOut
}

export type CurveApiReturn = {
  data: {
    poolList: { address: string; latestWeeklyApy: number }[]
  }
}

export type PendleApiReturn = {
  markets: { underlyingAsset: string; expiry: string; pt: string; address: string; details: { impliedApy: number }; yt: string }[]
}

export type ConvexFxnApiReturn = {
  pools: { augmentedPoolData: { curvePoolData?: { address: string }; rewardCoins: { address: string }[]; rewardAprs: number[] }[] }
}

export type Prices = { [address: string]: { decimals: number; symbol: string; price: number; timestamp: number; confidence: number } }

export const APR_TYPE: { [name: string]: number } = {
  "Convex CRV": 0,
  "Convex FXN": 1,
  "PENDLE PT": 2,
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
