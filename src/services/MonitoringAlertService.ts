import { mkdirSync, readFileSync, writeFileSync } from "fs"
import path from "path"

import { monitoringModuleConfig } from "../config/monitoring_config.js"
import { MonitoringRepository } from "../db/MonitoringRepository.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"

type AlertSeverity = "WARNING" | "DANGER" | "CRITICAL"
type PersistedAlertState = {
  severity: AlertSeverity
  status: "OPEN"
  lastValue: number
  updatedAt: string
}

type AlertStateFile = Record<string, PersistedAlertState>
type AlertCandidate = {
  key: string
  severity: AlertSeverity
  message: string
  value: number
}

export class MonitoringAlertService {
  constructor(
    private readonly monitoringRepository: MonitoringRepository,
    private readonly telegramNotifierService: TelegramNotifierService,
    private readonly stateFilePath: string
  ) {}

  async processAlerts(referenceDate = new Date()) {
    const [pegSnapshots, oracleSnapshots, latestGlobalHistory, positionRiskSnapshots] = await Promise.all([
      this.monitoringRepository.getLatestPegSnapshots(),
      this.monitoringRepository.getLatestOracleSnapshots(),
      this.monitoringRepository.getLatestGlobalHistory(),
      this.monitoringRepository.getLatestPositionRiskSnapshotsWithin24h(),
    ])

    const alertCandidates: AlertCandidate[] = [
      ...this.buildPegAlerts(pegSnapshots),
      ...this.buildOracleSanityAlerts(oracleSnapshots),
      ...this.buildCollateralizationAlerts(positionRiskSnapshots),
      ...this.buildLiquidationDistanceAlerts(positionRiskSnapshots),
      ...(latestGlobalHistory ? await this.buildTvlAlerts(latestGlobalHistory, referenceDate) : []),
    ]

    await this.flushAlerts(alertCandidates, referenceDate)
  }

  private buildPegAlerts(pegSnapshots: Awaited<ReturnType<MonitoringRepository["getLatestPegSnapshots"]>>): AlertCandidate[] {
    const thresholds = monitoringModuleConfig.peg.thresholds
    if (!thresholds) {
      return []
    }

    return pegSnapshots.flatMap((snapshot) => {
      const severity = this.toHighSeverity(snapshot.deviation_pct, thresholds.warning_pct as number, thresholds.danger_pct as number)
      if (!severity) {
        return []
      }

      return [
        {
          key: `PEG:${snapshot.token.address.toLowerCase()}`,
          severity,
          value: snapshot.deviation_pct,
          message: `PEG ${severity}: ${snapshot.token.symbol} deviation ${snapshot.deviation_pct.toFixed(2)}% vs ${snapshot.token.peg_type}`,
        },
      ]
    })
  }

  private buildOracleSanityAlerts(oracleSnapshots: Awaited<ReturnType<MonitoringRepository["getLatestOracleSnapshots"]>>): AlertCandidate[] {
    const thresholds = monitoringModuleConfig.oracle_sanity.thresholds
    if (!thresholds) {
      return []
    }

    return oracleSnapshots.flatMap((snapshot) => {
      const severity = this.toHighSeverity(snapshot.deviation_pct, thresholds.deviation_warning_pct as number, thresholds.deviation_danger_pct as number)
      if (!severity) {
        return []
      }

      return [
        {
          key: `ORACLE_SANITY:${snapshot.market.contract_address.toLowerCase()}`,
          severity,
          value: snapshot.deviation_pct,
          message:
            `ORACLE SANITY ${severity}: ${snapshot.market.contract_name} ` +
            `deviation ${snapshot.deviation_pct.toFixed(2)}% ` +
            `(oracle $${snapshot.oracle_price.toFixed(4)} vs offchain $${snapshot.offchain_price.toFixed(4)})`,
        },
      ]
    })
  }

  private async buildTvlAlerts(
    latestGlobalHistory: NonNullable<Awaited<ReturnType<MonitoringRepository["getLatestGlobalHistory"]>>>,
    referenceDate: Date
  ): Promise<AlertCandidate[]> {
    const thresholds = monitoringModuleConfig.tvl_variation.thresholds
    if (!thresholds || latestGlobalHistory.total_tvl <= 0) {
      return []
    }

    const [baseline1h, baseline24h] = await Promise.all([
      this.monitoringRepository.getGlobalHistoryAtOrBefore(new Date(referenceDate.getTime() - 60 * 60 * 1000)),
      this.monitoringRepository.getGlobalHistoryAtOrBefore(new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000)),
    ])

    const candidates: AlertCandidate[] = []
    const drop1h = this.computeDropPct(baseline1h?.total_tvl, latestGlobalHistory.total_tvl)
    const drop24h = this.computeDropPct(baseline24h?.total_tvl, latestGlobalHistory.total_tvl)

    const severity1h = this.toHighSeverity(drop1h, thresholds.warning_1h_pct as number, thresholds.danger_1h_pct as number)
    if (severity1h) {
      candidates.push({
        key: "TVL_VARIATION:1H",
        severity: severity1h,
        value: drop1h,
        message: `TVL ${severity1h}: protocol TVL down ${drop1h.toFixed(2)}% over 1h`,
      })
    }

    const severity24h = this.toHighSeverity(drop24h, thresholds.warning_24h_pct as number, thresholds.danger_24h_pct as number)
    if (severity24h) {
      candidates.push({
        key: "TVL_VARIATION:24H",
        severity: severity24h,
        value: drop24h,
        message: `TVL ${severity24h}: protocol TVL down ${drop24h.toFixed(2)}% over 24h`,
      })
    }

    return candidates
  }

  private buildCollateralizationAlerts(
    positionRiskSnapshots: Awaited<ReturnType<MonitoringRepository["getLatestPositionRiskSnapshotsWithin24h"]>>
  ): AlertCandidate[] {
    const thresholds = monitoringModuleConfig.collateralization.thresholds
    if (!thresholds) {
      return []
    }

    return positionRiskSnapshots.flatMap((snapshot) => {
      if (snapshot.user_debt <= 0 || snapshot.position_value_usd <= 0 || !snapshot.liquidation_threshold || snapshot.liquidation_threshold <= 0) {
        return []
      }

      const minCollateralizationRatio = 1 / snapshot.liquidation_threshold
      const severity = this.toLowSeverityFromMultipliers(
        snapshot.cr,
        minCollateralizationRatio * (thresholds.warning_multiplier as number),
        minCollateralizationRatio * (thresholds.danger_multiplier as number),
        minCollateralizationRatio * (thresholds.critical_multiplier as number)
      )

      if (!severity) {
        return []
      }

      return [
        {
          key: `COLLATERALIZATION:${snapshot.contract_address.toLowerCase()}:${snapshot.borrower_address.toLowerCase()}`,
          severity,
          value: snapshot.cr,
          message:
            `COLLATERALIZATION ${severity}: ${snapshot.contract_name} / ${snapshot.borrower_address.toLowerCase()} ` +
            `CR ${snapshot.cr.toFixed(3)} near minimum ${minCollateralizationRatio.toFixed(3)}`,
        },
      ]
    })
  }

  private buildLiquidationDistanceAlerts(
    positionRiskSnapshots: Awaited<ReturnType<MonitoringRepository["getLatestPositionRiskSnapshotsWithin24h"]>>
  ): AlertCandidate[] {
    const thresholds = monitoringModuleConfig.liquidation_distance.thresholds
    if (!thresholds) {
      return []
    }

    return positionRiskSnapshots.flatMap((snapshot) => {
      if (snapshot.user_debt <= 0 || snapshot.position_value_usd <= 0 || snapshot.liquidation_price <= 0) {
        return []
      }

      const severity = this.toLowSeverity(
        snapshot.distance_pct,
        thresholds.warning_pct as number,
        thresholds.danger_pct as number,
        thresholds.critical_pct as number
      )

      if (!severity) {
        return []
      }

      return [
        {
          key: `LIQUIDATION_DISTANCE:${snapshot.contract_address.toLowerCase()}:${snapshot.borrower_address.toLowerCase()}`,
          severity,
          value: snapshot.distance_pct,
          message:
            `LIQUIDATION DISTANCE ${severity}: ${snapshot.contract_name} / ${snapshot.borrower_address.toLowerCase()} ` +
            `distance ${snapshot.distance_pct.toFixed(2)}% to liquidation price $${snapshot.liquidation_price.toFixed(4)}`,
        },
      ]
    })
  }

  private computeDropPct(baselineValue: number | null | undefined, currentValue: number): number {
    if (baselineValue == null || baselineValue <= 0 || currentValue >= baselineValue) {
      return 0
    }

    return ((baselineValue - currentValue) / baselineValue) * 100
  }

  private toHighSeverity(value: number, warningThreshold: number, dangerThreshold: number): AlertSeverity | null {
    if (value >= dangerThreshold) {
      return "DANGER"
    }
    if (value >= warningThreshold) {
      return "WARNING"
    }
    return null
  }

  private toLowSeverity(value: number, warningThreshold: number, dangerThreshold: number, criticalThreshold: number): AlertSeverity | null {
    if (value <= criticalThreshold) {
      return "CRITICAL"
    }
    if (value <= dangerThreshold) {
      return "DANGER"
    }
    if (value <= warningThreshold) {
      return "WARNING"
    }
    return null
  }

  private toLowSeverityFromMultipliers(value: number, warningThreshold: number, dangerThreshold: number, criticalThreshold: number): AlertSeverity | null {
    if (value <= criticalThreshold) {
      return "CRITICAL"
    }
    if (value <= dangerThreshold) {
      return "DANGER"
    }
    if (value <= warningThreshold) {
      return "WARNING"
    }
    return null
  }

  private async flushAlerts(alertCandidates: AlertCandidate[], referenceDate: Date) {
    const previousState = this.readState()
    const nextState: AlertStateFile = {}
    const triggeredMessages: string[] = []
    const resolvedMessages: string[] = []

    for (const candidate of alertCandidates) {
      nextState[candidate.key] = {
        severity: candidate.severity,
        status: "OPEN",
        lastValue: candidate.value,
        updatedAt: referenceDate.toISOString(),
      }

      const previous = previousState[candidate.key]
      if (!previous || previous.severity !== candidate.severity) {
        triggeredMessages.push(candidate.message)
      }
    }

    for (const [key, previous] of Object.entries(previousState)) {
      if (nextState[key]) {
        continue
      }

      resolvedMessages.push(
        `${key.split(":")[0]} RESOLVED: ${key.split(":").slice(1).join(":")} back below alert threshold (last ${previous.severity.toLowerCase()} value ${previous.lastValue.toFixed(2)}%)`
      )
    }

    if (triggeredMessages.length > 0) {
      await this.telegramNotifierService.sendMessage(this.buildBatchMessage("Monitoring alerts triggered", triggeredMessages))
    }

    if (resolvedMessages.length > 0) {
      await this.telegramNotifierService.sendMessage(this.buildBatchMessage("Monitoring alerts resolved", resolvedMessages))
    }

    this.writeState(nextState)
  }

  private buildBatchMessage(title: string, messages: string[]) {
    return [title, ...messages.map((message) => `- ${message}`)].join("\n")
  }

  private readState(): AlertStateFile {
    try {
      return JSON.parse(readFileSync(this.stateFilePath, "utf8")) as AlertStateFile
    } catch {
      return {}
    }
  }

  private writeState(state: AlertStateFile) {
    mkdirSync(path.dirname(this.stateFilePath), { recursive: true })
    writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2))
  }
}
