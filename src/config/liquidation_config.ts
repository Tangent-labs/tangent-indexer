import * as dotenv from "dotenv"
dotenv.config()

export type LiquidationConfig = {
  snapshotTolerance: number
  queueRedis: string
  queue: {
    attempts: number
    backoff: {
      type: "fixed" | "exponential"
      delay: number
    }
  }
  limits: {
    maxPriceImpact: number
    oraclePriceProtectionBps: number // Protection percentage in basis points (e.g., 150 = 1.5%)
  }
  enso: {
    baseUrl: string
    apiKey: string
  }
}

export const liquidationConfig = {
  snapshotTolerance: Number(process.env.SNAPSHOT_TOLERANCE) || 0.01,
  queueRedis: process.env.LIQUIDATION_QUEUE_REDIS || "",
  queue: {
    attempts: Number(process.env.LIQUIDATION_QUEUE_ATTEMPTS) || 10,
    backoff: {
      type: (process.env.LIQUIDATION_QUEUE_BACKOFF_TYPE as "fixed" | "exponential") || "fixed",
      delay: Number(process.env.LIQUIDATION_QUEUE_BACKOFF_DELAY) || 12_000, // 1 block time (12s)
    },
  },
  limits: {
    maxPriceImpact: Number(process.env.MAX_PRICE_IMPACT) || 0.01,
    oraclePriceProtectionBps: Number(process.env.ORACLE_PRICE_PROTECTION_BPS) || 200, // Default 2% protection
  },
  enso: {
    baseUrl: process.env.ENSO_API_BASE_URL || "https://api.enso.finance/api/v1/shortcuts/route",
    apiKey: process.env.ENSO_API_KEY || "",
  },
} satisfies LiquidationConfig
