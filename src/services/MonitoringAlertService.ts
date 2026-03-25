import { mkdirSync } from "fs"
import { readFile, writeFile } from "fs/promises"
import path from "path"

import { monitoringModuleConfig } from "../config/monitoring_config.js"
import { MonitoringRepository } from "../db/MonitoringRepository.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"

type AlertSeverity = "WARNING" | "DANGER" | "CRITICAL"
const SHORT_ADDRESS_THRESHOLD = 12

type PersistedAlertState = {
  severity: AlertSeverity
  status: "OPEN"
  lastValue: number
  updatedAt: string
}

type AlertStateFile = Record<string, PersistedAlertState>
type AlertCategory = "PEG" | "ORACLE_SANITY" | "COLLATERALIZATION" | "LIQUIDATION_DISTANCE" | "TVL"
type AlertCandidate = {
  key: string
  category: AlertCategory
  severity: AlertSeverity
  message: string
  value: number
}

export class MonitoringAlertService {
  private readonly monitoringRepository: MonitoringRepository
  private readonly telegramNotifierService: TelegramNotifierService
  private readonly stateFilePath: string

  constructor(monitoringRepository: MonitoringRepository, telegramNotifierService: TelegramNotifierService, stateFilePath: string) {
    this.monitoringRepository = monitoringRepository
    this.telegramNotifierService = telegramNotifierService
    this.stateFilePath = stateFilePath
  }

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

    return pegSnapshots.flatMap((snapshot) => {
      const severity = this.toHighSeverity(snapshot.deviation_pct, thresholds.warning_pct, thresholds.danger_pct)
      if (!severity) {
        return []
      }

      return [
        {
          key: `PEG:${snapshot.token.address.toLowerCase()}`,
          category: "PEG",
          severity,
          value: snapshot.deviation_pct,
          message: `[${severity}] ${snapshot.token.symbol}: deviation ${snapshot.deviation_pct.toFixed(2)}% vs ${snapshot.token.peg_type}`,
        },
      ]
    })
  }

  private buildOracleSanityAlerts(oracleSnapshots: Awaited<ReturnType<MonitoringRepository["getLatestOracleSnapshots"]>>): AlertCandidate[] {
    const thresholds = monitoringModuleConfig.oracle_sanity.thresholds

    return oracleSnapshots.flatMap((snapshot) => {
      const severity = this.toHighSeverity(snapshot.deviation_pct, thresholds.deviation_warning_pct, thresholds.deviation_danger_pct)
      if (!severity) {
        return []
      }

      return [
        {
          key: `ORACLE_SANITY:${snapshot.market.contract_address.toLowerCase()}`,
          category: "ORACLE_SANITY",
          severity,
          value: snapshot.deviation_pct,
          message:
            `[${severity}] ${snapshot.market.contract_name}: ` +
            `${snapshot.deviation_pct.toFixed(2)}% ` +
            `(oracle $${snapshot.oracle_price.toFixed(4)}, offchain $${snapshot.offchain_price.toFixed(4)})`,
        },
      ]
    })
  }

  private async buildTvlAlerts(
    latestGlobalHistory: NonNullable<Awaited<ReturnType<MonitoringRepository["getLatestGlobalHistory"]>>>,
    referenceDate: Date
  ): Promise<AlertCandidate[]> {
    const thresholds = monitoringModuleConfig.tvl_variation.thresholds
    if (latestGlobalHistory.total_tvl <= 0) {
      return []
    }

    const [baseline1h, baseline24h] = await Promise.all([
      this.monitoringRepository.getGlobalHistoryAtOrBefore(new Date(referenceDate.getTime() - 60 * 60 * 1000)),
      this.monitoringRepository.getGlobalHistoryAtOrBefore(new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000)),
    ])

    const candidates: AlertCandidate[] = []
    const drop1h = this.computeDropPct(baseline1h?.total_tvl, latestGlobalHistory.total_tvl)
    const drop24h = this.computeDropPct(baseline24h?.total_tvl, latestGlobalHistory.total_tvl)

    const severity1h = this.toHighSeverity(drop1h, thresholds.warning_1h_pct, thresholds.danger_1h_pct)
    if (severity1h) {
      candidates.push({
        key: "TVL_VARIATION:1H",
        category: "TVL",
        severity: severity1h,
        value: drop1h,
        message: `[${severity1h}] TVL down ${drop1h.toFixed(2)}% over 1h`,
      })
    }

    const severity24h = this.toHighSeverity(drop24h, thresholds.warning_24h_pct, thresholds.danger_24h_pct)
    if (severity24h) {
      candidates.push({
        key: "TVL_VARIATION:24H",
        category: "TVL",
        severity: severity24h,
        value: drop24h,
        message: `[${severity24h}] TVL down ${drop24h.toFixed(2)}% over 24h`,
      })
    }

    return candidates
  }

  private buildCollateralizationAlerts(
    positionRiskSnapshots: Awaited<ReturnType<MonitoringRepository["getLatestPositionRiskSnapshotsWithin24h"]>>
  ): AlertCandidate[] {
    const thresholds = monitoringModuleConfig.collateralization.thresholds

    return positionRiskSnapshots.flatMap((snapshot) => {
      if (snapshot.user_debt <= 0 || snapshot.position_value_usd <= 0 || !snapshot.liquidation_threshold || snapshot.liquidation_threshold <= 0) {
        return []
      }

      const minCollateralizationRatio = 1 / snapshot.liquidation_threshold
      const severity = this.toLowSeverity(
        snapshot.cr,
        minCollateralizationRatio * thresholds.warning_multiplier,
        minCollateralizationRatio * thresholds.danger_multiplier,
        minCollateralizationRatio * thresholds.critical_multiplier
      )

      if (!severity) {
        return []
      }

      return [
        {
          key: `COLLATERALIZATION:${snapshot.contract_address.toLowerCase()}:${snapshot.borrower_address.toLowerCase()}`,
          category: "COLLATERALIZATION",
          severity,
          value: snapshot.cr,
          message:
            `[${severity}] ${snapshot.contract_name} / ${this.shortAddress(snapshot.borrower_address)}: ` +
            `CR ${snapshot.cr.toFixed(3)} (min ${minCollateralizationRatio.toFixed(3)})`,
        },
      ]
    })
  }

  private buildLiquidationDistanceAlerts(
    positionRiskSnapshots: Awaited<ReturnType<MonitoringRepository["getLatestPositionRiskSnapshotsWithin24h"]>>
  ): AlertCandidate[] {
    const thresholds = monitoringModuleConfig.liquidation_distance.thresholds

    return positionRiskSnapshots.flatMap((snapshot) => {
      if (snapshot.user_debt <= 0 || snapshot.position_value_usd <= 0 || snapshot.liquidation_price <= 0) {
        return []
      }

      const severity = this.toLowSeverity(snapshot.distance_pct, thresholds.warning_pct, thresholds.danger_pct, thresholds.critical_pct)

      if (!severity) {
        return []
      }

      return [
        {
          key: `LIQUIDATION_DISTANCE:${snapshot.contract_address.toLowerCase()}:${snapshot.borrower_address.toLowerCase()}`,
          category: "LIQUIDATION_DISTANCE",
          severity,
          value: snapshot.distance_pct,
          message:
            `[${severity}] ${snapshot.contract_name} / ${this.shortAddress(snapshot.borrower_address)}: ` +
            `${snapshot.distance_pct.toFixed(2)}% to liq price $${snapshot.liquidation_price.toFixed(4)}`,
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
    // High-side alerts only escalate to WARNING then DANGER; CRITICAL is reserved for low-side position risk alerts.
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

  private async flushAlerts(alertCandidates: AlertCandidate[], referenceDate: Date) {
    const previousState = await this.readState()
    const nextState: AlertStateFile = {}
    const triggeredCandidates: AlertCandidate[] = []
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
        triggeredCandidates.push(candidate)
      }
    }

    for (const [key, previous] of Object.entries(previousState)) {
      if (nextState[key]) {
        continue
      }

      resolvedMessages.push(this.buildResolvedMessage(key, previous))
    }

    if (triggeredCandidates.length > 0) {
      await this.telegramNotifierService.sendMessage(this.buildTriggeredBatchMessage("Monitoring alerts triggered", triggeredCandidates))
    }

    if (resolvedMessages.length > 0) {
      await this.telegramNotifierService.sendMessage(this.buildResolvedBatchMessage("Monitoring alerts resolved", resolvedMessages))
    }

    await this.writeState(nextState)
  }

  private buildTriggeredBatchMessage(title: string, candidates: AlertCandidate[]) {
    const categoryOrder: AlertCategory[] = ["PEG", "ORACLE_SANITY", "COLLATERALIZATION", "LIQUIDATION_DISTANCE", "TVL"]
    const grouped = new Map<AlertCategory, string[]>()

    for (const candidate of candidates) {
      if (!grouped.has(candidate.category)) {
        grouped.set(candidate.category, [])
      }
      grouped.get(candidate.category)!.push(candidate.message)
    }

    const lines = [title]
    for (const category of categoryOrder) {
      const messages = grouped.get(category)
      if (!messages || messages.length === 0) {
        continue
      }

      lines.push("")
      lines.push(this.getCategoryTitle(category))
      lines.push(...messages.map((message) => `- ${message}`))
    }

    return lines.join("\n")
  }

  private buildResolvedBatchMessage(title: string, messages: string[]) {
    return [title, "", ...messages.map((message) => `- ${message}`)].join("\n")
  }

  private buildResolvedMessage(key: string, previous: PersistedAlertState) {
    const [category, firstRef, secondRef] = key.split(":")
    const prefix = `[RESOLVED]`
    const lastValue = `${previous.lastValue.toFixed(2)}%`
    const severity = previous.severity.toLowerCase()

    switch (category) {
      case "PEG":
        return `${prefix} Peg ${this.shortAddress(firstRef)} back below threshold (last ${severity} ${lastValue})`
      case "ORACLE_SANITY":
        return `${prefix} Oracle sanity ${this.shortAddress(firstRef)} back below threshold (last ${severity} ${lastValue})`
      case "COLLATERALIZATION":
        return `${prefix} Collateralization ${this.shortAddress(firstRef)} / ${this.shortAddress(secondRef)} back to normal (last ${severity} ${lastValue})`
      case "LIQUIDATION_DISTANCE":
        return `${prefix} Liquidation distance ${this.shortAddress(firstRef)} / ${this.shortAddress(secondRef)} back to normal (last ${severity} ${lastValue})`
      case "TVL_VARIATION":
        return `${prefix} TVL ${firstRef} back below threshold (last ${severity} ${lastValue})`
      default:
        return `${prefix} ${key} back below threshold (last ${severity} ${lastValue})`
    }
  }

  private getCategoryTitle(category: AlertCategory) {
    switch (category) {
      case "PEG":
        return "Peg"
      case "ORACLE_SANITY":
        return "Oracle sanity"
      case "COLLATERALIZATION":
        return "Collateralization"
      case "LIQUIDATION_DISTANCE":
        return "Liquidation distance"
      case "TVL":
        return "TVL"
    }
  }

  private shortAddress(address: string | undefined) {
    if (!address) {
      return "unknown"
    }

    if (address.length <= SHORT_ADDRESS_THRESHOLD) {
      return address.toLowerCase()
    }

    return `${address.slice(0, 6).toLowerCase()}...${address.slice(-4).toLowerCase()}`
  }

  private async readState(): Promise<AlertStateFile> {
    try {
      const rawState = JSON.parse(await readFile(this.stateFilePath, "utf8")) as unknown
      return this.parseStateFile(rawState)
    } catch {
      return {}
    }
  }

  private async writeState(state: AlertStateFile) {
    mkdirSync(path.dirname(this.stateFilePath), { recursive: true })
    await writeFile(this.stateFilePath, JSON.stringify(state, null, 2))
  }

  private parseStateFile(rawState: unknown): AlertStateFile {
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
      return {}
    }

    const nextState: AlertStateFile = {}

    for (const [key, value] of Object.entries(rawState)) {
      if (!this.isPersistedAlertState(value)) {
        continue
      }

      nextState[key] = value
    }

    return nextState
  }

  private isPersistedAlertState(value: unknown): value is PersistedAlertState {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false
    }

    const candidate = value as Partial<PersistedAlertState>
    const isSeverity = candidate.severity === "WARNING" || candidate.severity === "DANGER" || candidate.severity === "CRITICAL"

    return (
      isSeverity &&
      candidate.status === "OPEN" &&
      typeof candidate.lastValue === "number" &&
      Number.isFinite(candidate.lastValue) &&
      typeof candidate.updatedAt === "string"
    )
  }
}
