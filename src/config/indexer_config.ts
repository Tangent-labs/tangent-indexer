import { AddressLike } from "ethers"
import * as dotenv from "dotenv"
dotenv.config()

export type IndexerConfig = {
  blockRange: number
  startingBlock: number
  provider: {
    chainId: string
    maxRetries: number
    timeOutMs: number
    switchRpcTimeoutMs: number
    chainRpc: string[]
  }
  walletsPk: string[]
  minEthBalance: number
  db: {
    maxRetries: number
  }
  sentry: {
    dsn: string
  }
  contracts: {
    marketCreatorAddress: AddressLike
    liquidatorProxyAddress: AddressLike
    liquidatorAddress: AddressLike
    curveRouterAddress: AddressLike
    pendleRouterAddress: AddressLike
  }
  enso: {
    baseUrl: string
  }
  liquidationQueueRedis: string
  liquidationQueue: {
    attempts: number
    backoff: {
      type: "fixed" | "exponential"
      delay: number
    }
  }
  liquidationLimits: {
    maxPriceImpact: number
  }
}

const { blockRange, chainId, chainRpcs, walletPks, startingBlock } = _initEnv()

export const indexerConfig = {
  blockRange,
  startingBlock,
  db: {
    maxRetries: 3,
  },
  provider: {
    chainId,
    maxRetries: 2,
    timeOutMs: 2000,
    switchRpcTimeoutMs: 10000,
    chainRpc: chainRpcs?.split(",") || [],
  },
  walletsPk: walletPks?.split(",") || [],
  minEthBalance: Number(process.env.MIN_ETH_BALANCE) || 0.01,
  sentry: {
    dsn: process.env.SENTRY_SDN || "",
  },
  enso: {
    baseUrl: "https://api.enso.finance/api/v1/shortcuts/route",
  },
  liquidationQueueRedis: process.env.LIQUIDATION_QUEUE_REDIS,
  liquidationQueue: {
    attempts: Number(process.env.LIQUIDATION_QUEUE_ATTEMPTS) || 10,
    backoff: {
      type: (process.env.LIQUIDATION_QUEUE_BACKOFF_TYPE as "fixed" | "exponential") || "exponential",
      delay: Number(process.env.LIQUIDATION_QUEUE_BACKOFF_DELAY) || 5000, // 5 seconds
    },
  },
  liquidationLimits: {
    maxPriceImpact: Number(process.env.MAX_PRICE_IMPACT) || 0.01,
  },
} as IndexerConfig

function _initEnv() {
  const blockRangeEnv = process.env.INDEXING_BLOCK_RANGE
  if (!blockRangeEnv) {
    throw new Error("INDEXING_BLOCK_RANGE_NOT_SET")
  }

  const chainId = process.env.CHAIN_ID
  if (!chainId) {
    throw new Error("CHAIN_ID_NOT_SET")
  }

  const chainRpcs = process.env.CHAIN_RPCS
  if (!chainRpcs) {
    throw new Error("CHAIN_RPCS_NOT_SET")
  }

  const walletPks = process.env.WALLET_PKS
  if (!walletPks) {
    throw new Error("WALLET_PKS_NOT_SET")
  }

  const startingBlock = process.env.STARTING_BLOCK
  if (!startingBlock) {
    throw new Error("STARTING_BLOCK_NOT_SET")
  }

  return { blockRange: Number(blockRangeEnv), chainId, chainRpcs, walletPks, startingBlock: Number(startingBlock) }
}
