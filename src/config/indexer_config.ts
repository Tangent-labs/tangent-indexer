import * as dotenv from "dotenv"
import { mkdirSync } from "fs"
import os from "os"
import path from "path"
dotenv.config()

export type IndexerConfig = {
  blockRange: number
  startingBlock: number
  sharedDataDir: string
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
}

const { blockRange, chainId, chainRpcs, walletPks, startingBlock } = _initEnv()
const defaultSharedDataDir = process.platform === "win32" ? `${process.env.TEMP || "C:\\Temp"}\\tangent-indexer` : path.join(os.homedir(), ".tangent-indexer")
const sharedDataDir = process.env.SHARED_DATA_DIR || defaultSharedDataDir
mkdirSync(sharedDataDir, { recursive: true })

export const indexerConfig = {
  blockRange,
  startingBlock,
  sharedDataDir,
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
