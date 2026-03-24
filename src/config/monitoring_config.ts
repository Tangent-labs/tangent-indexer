import * as dotenv from "dotenv"

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

export type MonitoringModuleConfig = {
  ttl: number
  filters: string[]
  paginated: boolean
  thresholds?: Record<string, number | Record<string, number>>
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

export const monitoringModuleConfig = {
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
} satisfies Record<MonitoringModuleName, MonitoringModuleConfig>
