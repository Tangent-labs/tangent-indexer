import { AddressLike } from "ethers"
import addresses from "../addresses-liquidation.json"
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
    chainRpc: string
    fallbackRpc?: string
  }
  db: {
    maxRetries: number
  }
  sentry: {
    dsn: string
  }
  constracts: {
    marketCreatorAddress: AddressLike
  }
  enso: {
    baseUrl: string
  }
}

const { blockRange, chainId, chainRpc, startingBlock } = _initEnv()

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
    chainRpc,
    fallbackRpc: undefined,
  },
  sentry: {
    dsn: process.env.SENTRY_SDN || "",
  },
  constracts: {
    marketCreatorAddress: addresses.utilities.marketCreator as AddressLike,
  },
  enso: {
    baseUrl: "https://api.enso.finance/api/v1/shortcuts/route",
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

  const chainRpc = process.env.CHAIN_RPC
  if (!chainRpc) {
    throw new Error("CHAIN_RPC_NOT_SET")
  }

  const startingBlock = process.env.STARTING_BLOCK
  if (!blockRangeEnv) {
    throw new Error("STARTING_BLOCK_NOT_SET")
  }

  return { blockRange: Number(blockRangeEnv), chainId, chainRpc, startingBlock: Number(startingBlock) }
}
