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
export type TokenAmount = {
  token: string
  amount: bigint
}
export type TVLStreamingData = {
  totalSupplyUnderlying: bigint
  streamingData: TokenAmount[]
}
export type TVLAprs = {
  globalData: GlobalData
  currentAPR: TokenAmount[]
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


// STAKE DAO 


type Address = string;

export interface Token {
  id: string;
  strId?: string;
  address: Address;
  chainId: number;
  name: string;
  symbol: string;
  decimals: number;
  price?: number;
  logoURI?: string;
  tags?: string[];
  extensions?: {
    onChainPrice?: {
      to: Address;
      data: string;
      decimals: number;
    };
    coingeckoId?: string;
  };
}

export interface TokenAmountReward {
  token: Token;
  end: number;
  rate: string; // bigint string
  apr: number;
  source?: string;
}

export interface Coin {
  id: string;
  name: string;
  symbol: string;
  address: Address;
  decimals: number;
  logoURI: string;
  price: number;
}

export interface Gauge {
  address: Address;
  totalSupply: string;
  totalSupplyUsd: number;
}

export interface LpToken {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
}

export interface AprDetails {
  label: string;
  value: number[];
}

export interface Apr {
  boost: number;
  current: {
    total: number;
    details: AprDetails[];
  };
}

export interface OnlyBoost {
  active: boolean;
  implementations: {
    key: string;
    address: Address;
  }[];
  totalSupply: string;
  boost: number;
  optimalBoost: number;
  stakeDao: BoostSide;
  sidecar: BoostSide;
}

export interface BoostSide {
  tvl: number;
  supply: string;
  boost: number;
  share: number;
  workingBalance?: string;
  workingBalanceShare?: string;
  optimal: {
    tvl: number;
    supply: string;
    boost: number;
    share: number;
  };
}

export interface SidecarPool {
  id: number;
  address: Address;
}

export interface StakeDaoApiData {
  key: string;
  name: string;
  type: string;
  version: number;
  protocol: string;
  chainId: number;
  vault: Address;
  gaugeAddress: Address;
  isLending: boolean;
  streaming: boolean;
  tokensFilter: string[];

  lpToken: LpToken;
  gauge: Gauge;

  coins: Coin[];
  underlyingCoins: Coin[];

  lpPriceInUsd: number;
  tvl: number;

  apr: Apr;
  rewards: TokenAmountReward[];

  tradingApy: number;
  minApr: number;
  maxApr: number;

  totalSupply: string;

  onlyboost: OnlyBoost;

  sidecarPool: SidecarPool;

  error?: any
}


export type StakeDaoApiReturn = {
  data?: StakeDaoApiData[]
  error?: any;
}