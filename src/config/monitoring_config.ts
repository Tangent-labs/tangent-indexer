import * as dotenv from "dotenv"
import { INDEXER_EXECUTION_NAMES, IndexerExecutionName } from "../type/indexerExecution.js"

dotenv.config()

export type MonitoringModuleName =
  | "overview"
  | "collateralization"
  | "liquidation_distance"
  | "peg"
  | "price_variation"
  | "oracle_sanity"
  | "debt_utilization"
  | "tvl_variation"
  | "liquidations"
  | "ltv_distribution"
  | "indexer_health"

export type MonitoringModuleConfig = {
  ttl: number
  filters: string[]
  paginated: boolean
  thresholds?: Record<string, number | Record<string, number>>
}

type PegThresholds = {
  safe_pct: number
  warning_pct: number
  danger_pct: number
}

type OracleSanityThresholds = {
  deviation_warning_pct: number
  deviation_danger_pct: number
  max_age_warning_seconds: number
  max_age_danger_seconds: number
}

type CollateralizationThresholds = {
  warning_multiplier: number
  danger_multiplier: number
  critical_multiplier: number
}

type LiquidationDistanceThresholds = {
  safe_pct: number
  warning_pct: number
  danger_pct: number
  critical_pct: number
}

type TvlVariationThresholds = {
  warning_1h_pct: number
  danger_1h_pct: number
  warning_24h_pct: number
  danger_24h_pct: number
}

export type IndexerHealthIndexerConfig = {
  enabled: boolean
  warningAfterMinutes: number
  criticalAfterMinutes: number
  criticalRepeatMinutes: number
  maxConsecutiveFailures: number
}

type IndexerHealthDefaultConfig = Partial<IndexerHealthIndexerConfig>

type IndexerHealthConfig = MonitoringModuleConfig & {
  thresholds: {
    warning_after_minutes: number
    critical_after_minutes: number
    critical_repeat_minutes: number
    max_consecutive_failures: number
  }
  indexers: Record<IndexerExecutionName, IndexerHealthIndexerConfig>
}

type MonitoringConfig = {
  overview: MonitoringModuleConfig
  collateralization: MonitoringModuleConfig & { thresholds: CollateralizationThresholds }
  liquidation_distance: MonitoringModuleConfig & { thresholds: LiquidationDistanceThresholds }
  peg: MonitoringModuleConfig & { thresholds: PegThresholds }
  price_variation: MonitoringModuleConfig
  oracle_sanity: MonitoringModuleConfig & { thresholds: OracleSanityThresholds }
  debt_utilization: MonitoringModuleConfig
  tvl_variation: MonitoringModuleConfig & { thresholds: TvlVariationThresholds }
  liquidations: MonitoringModuleConfig
  ltv_distribution: MonitoringModuleConfig
  indexer_health: IndexerHealthConfig
}

function envFloat(name: string, fallback: number): number {
  const rawValue = process.env[name]
  if (rawValue == null || rawValue.trim() === "") {
    return fallback
  }

  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return parsed
}

function envBoolean(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name]
  if (rawValue == null || rawValue.trim() === "") {
    return fallback
  }

  return rawValue === "true" || rawValue === "1"
}

function buildIndexerHealthConfig(envKey: string, defaults: IndexerHealthDefaultConfig = {}): IndexerHealthIndexerConfig {
  const defaultWarningAfterMinutes = envFloat("MONITORING_INDEXER_HEALTH_WARNING_AFTER_MIN", defaults.warningAfterMinutes ?? 15)
  const defaultCriticalAfterMinutes = envFloat("MONITORING_INDEXER_HEALTH_CRITICAL_AFTER_MIN", defaults.criticalAfterMinutes ?? 60)
  const defaultCriticalRepeatMinutes = envFloat("MONITORING_INDEXER_HEALTH_CRITICAL_REPEAT_MIN", defaults.criticalRepeatMinutes ?? 60)
  const defaultMaxConsecutiveFailures = envFloat("MONITORING_INDEXER_HEALTH_DEFAULT_MAX_CONSECUTIVE_FAILURES", defaults.maxConsecutiveFailures ?? 3)

  return {
    enabled: envBoolean(`MONITORING_INDEXER_HEALTH_${envKey}_ENABLED`, defaults.enabled ?? true),
    warningAfterMinutes: envFloat(`MONITORING_INDEXER_HEALTH_${envKey}_WARNING_AFTER_MIN`, defaultWarningAfterMinutes),
    criticalAfterMinutes: envFloat(`MONITORING_INDEXER_HEALTH_${envKey}_CRITICAL_AFTER_MIN`, defaultCriticalAfterMinutes),
    criticalRepeatMinutes: envFloat(`MONITORING_INDEXER_HEALTH_${envKey}_CRITICAL_REPEAT_MIN`, defaultCriticalRepeatMinutes),
    maxConsecutiveFailures: envFloat(`MONITORING_INDEXER_HEALTH_${envKey}_MAX_CONSECUTIVE_FAILURES`, defaultMaxConsecutiveFailures),
  }
}

const hourlyIndexerDefaults: IndexerHealthDefaultConfig = {
  warningAfterMinutes: 120,
  criticalAfterMinutes: 180,
  criticalRepeatMinutes: 180,
}

const blockIndexerDefaults: IndexerHealthDefaultConfig = {
  warningAfterMinutes: 5,
  criticalAfterMinutes: 10,
  criticalRepeatMinutes: 60,
}

const dailyBatchIndexerDefaults: IndexerHealthDefaultConfig = {
  warningAfterMinutes: 24 * 60,
  criticalAfterMinutes: 48 * 60,
  criticalRepeatMinutes: 12 * 60,
  maxConsecutiveFailures: 2,
}

const eventDrivenIndexerDefaults: IndexerHealthDefaultConfig = {
  enabled: false,
  warningAfterMinutes: 24 * 60,
  criticalAfterMinutes: 48 * 60,
  criticalRepeatMinutes: 12 * 60,
  maxConsecutiveFailures: 2,
}

const liquidationProcessIndexerDefaults: IndexerHealthDefaultConfig = {
  warningAfterMinutes: 5,
  criticalAfterMinutes: 10,
  criticalRepeatMinutes: 30,
  maxConsecutiveFailures: 2,
}

const liquidationCheckIndexerDefaults: IndexerHealthDefaultConfig = {
  warningAfterMinutes: 5,
  criticalAfterMinutes: 10,
  criticalRepeatMinutes: 30,
}

const defaultIndexerHealthThresholds = {
  warning_after_minutes: envFloat("MONITORING_INDEXER_HEALTH_WARNING_AFTER_MIN", 15),
  critical_after_minutes: envFloat("MONITORING_INDEXER_HEALTH_CRITICAL_AFTER_MIN", 60),
  critical_repeat_minutes: envFloat("MONITORING_INDEXER_HEALTH_CRITICAL_REPEAT_MIN", 60),
  max_consecutive_failures: envFloat("MONITORING_INDEXER_HEALTH_DEFAULT_MAX_CONSECUTIVE_FAILURES", 3),
}

export const monitoringModuleConfig: MonitoringConfig = {
  overview: {
    ttl: 120,
    filters: [],
    paginated: false,
  },
  collateralization: {
    ttl: 60,
    filters: ["market_address", "borrower_address", "status"],
    paginated: true,
    thresholds: {
      warning_multiplier: envFloat("MONITORING_COLLAT_WARNING_MULT", 1.2),
      danger_multiplier: envFloat("MONITORING_COLLAT_DANGER_MULT", 1.1),
      critical_multiplier: envFloat("MONITORING_COLLAT_CRITICAL_MULT", 1.03),
    },
  },
  liquidation_distance: {
    ttl: 60,
    filters: ["market_address", "borrower_address", "status"],
    paginated: true,
    thresholds: {
      safe_pct: envFloat("MONITORING_LIQDIST_SAFE_PCT", 5.0),
      warning_pct: envFloat("MONITORING_LIQDIST_WARNING_PCT", 2.0),
      danger_pct: envFloat("MONITORING_LIQDIST_DANGER_PCT", 1.0),
      critical_pct: envFloat("MONITORING_LIQDIST_CRITICAL_PCT", 0.5),
    },
  },
  peg: {
    ttl: 60,
    filters: ["status", "asset"],
    paginated: false,
    thresholds: {
      safe_pct: envFloat("MONITORING_PEG_SAFE_PCT", 0.5),
      warning_pct: envFloat("MONITORING_PEG_WARNING_PCT", 2.0),
      danger_pct: envFloat("MONITORING_PEG_DANGER_PCT", 5.0),
    },
  },
  price_variation: {
    ttl: 60,
    filters: ["market_address", "status"],
    paginated: false,
    thresholds: {
      stable: {
        "5m": envFloat("MONITORING_PRICEVAR_STABLE_5M", 0.3),
        "15m": envFloat("MONITORING_PRICEVAR_STABLE_15M", 0.5),
        "1h": envFloat("MONITORING_PRICEVAR_STABLE_1H", 1.0),
        "4h": envFloat("MONITORING_PRICEVAR_STABLE_4H", 2.0),
      },
      volatile: {
        "5m": envFloat("MONITORING_PRICEVAR_VOLATILE_5M", 2.0),
        "15m": envFloat("MONITORING_PRICEVAR_VOLATILE_15M", 5.0),
        "1h": envFloat("MONITORING_PRICEVAR_VOLATILE_1H", 10.0),
        "4h": envFloat("MONITORING_PRICEVAR_VOLATILE_4H", 15.0),
      },
    },
  },
  oracle_sanity: {
    ttl: 60,
    filters: ["market_address", "status"],
    paginated: false,
    thresholds: {
      deviation_warning_pct: envFloat("MONITORING_ORACLE_DEV_WARNING_PCT", 2.0),
      deviation_danger_pct: envFloat("MONITORING_ORACLE_DEV_DANGER_PCT", 5.0),
      max_age_warning_seconds: envFloat("MONITORING_ORACLE_AGE_WARNING_S", 3600),
      max_age_danger_seconds: envFloat("MONITORING_ORACLE_AGE_DANGER_S", 7200),
    },
  },
  debt_utilization: {
    ttl: 60,
    filters: ["market_address"],
    paginated: false,
    thresholds: {
      warning_pct: envFloat("MONITORING_DEBT_WARNING_PCT", 85.0),
      danger_pct: envFloat("MONITORING_DEBT_DANGER_PCT", 95.0),
    },
  },
  tvl_variation: {
    ttl: 60,
    filters: ["market_address"],
    paginated: false,
    thresholds: {
      warning_1h_pct: envFloat("MONITORING_TVL_WARNING_1H_PCT", 10.0),
      danger_1h_pct: envFloat("MONITORING_TVL_DANGER_1H_PCT", 15.0),
      warning_24h_pct: envFloat("MONITORING_TVL_WARNING_24H_PCT", 20.0),
      danger_24h_pct: envFloat("MONITORING_TVL_DANGER_24H_PCT", 30.0),
    },
  },
  liquidations: {
    ttl: 60,
    filters: ["market_address", "borrower_address"],
    paginated: true,
  },
  ltv_distribution: {
    ttl: 60,
    filters: ["market_address"],
    paginated: false,
  },
  indexer_health: {
    ttl: 60,
    filters: ["indexer_name", "status"],
    paginated: false,
    thresholds: defaultIndexerHealthThresholds,
    indexers: {
      [INDEXER_EXECUTION_NAMES.BLOCK]: buildIndexerHealthConfig("BLOCK", blockIndexerDefaults),
      [INDEXER_EXECUTION_NAMES.GLOBAL_DATA]: buildIndexerHealthConfig("GLOBAL_DATA"),
      [INDEXER_EXECUTION_NAMES.LIQUIDATION_CHECK]: buildIndexerHealthConfig("LIQUIDATION_CHECK", liquidationCheckIndexerDefaults),
      [INDEXER_EXECUTION_NAMES.LIQUIDATION_PROCESS]: buildIndexerHealthConfig("LIQUIDATION_PROCESS", liquidationProcessIndexerDefaults),
      [INDEXER_EXECUTION_NAMES.MONITORING_CHECK]: buildIndexerHealthConfig("MONITORING_CHECK"),
      [INDEXER_EXECUTION_NAMES.SNAPSHOT_PRICES]: buildIndexerHealthConfig("SNAPSHOT_PRICES"),
      [INDEXER_EXECUTION_NAMES.ONCHAIN_TX_BOT]: buildIndexerHealthConfig("ONCHAIN_TX_BOT", hourlyIndexerDefaults),
      [INDEXER_EXECUTION_NAMES.PEG_KEEPER_UPDATE]: buildIndexerHealthConfig("PEG_KEEPER_UPDATE", hourlyIndexerDefaults),
      [INDEXER_EXECUTION_NAMES.PREDEPOSIT]: buildIndexerHealthConfig("PREDEPOSIT", eventDrivenIndexerDefaults),
      [INDEXER_EXECUTION_NAMES.POINTS_LP]: buildIndexerHealthConfig("POINTS_LP", dailyBatchIndexerDefaults),
      [INDEXER_EXECUTION_NAMES.POINTS_VOTES]: buildIndexerHealthConfig("POINTS_VOTES", dailyBatchIndexerDefaults),
    },
  },
}
