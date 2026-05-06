import { mkdirSync } from "fs"
import { readFile, writeFile } from "fs/promises"
import path from "path"

import { IndexerHealthIndexerConfig, monitoringModuleConfig } from "../config/monitoring_config.js"
import { IndexerExecutionLogRepository } from "../db/IndexerExecutionLogRepository.js"
import { INDEXER_EXECUTION_NAMES, IndexerExecutionName } from "../type/indexerExecution.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"

type AlertSeverity = "WARNING" | "CRITICAL"
type AlertCategory = "STALE" | "FAILURES"

type PersistedAlertState = {
  severity: AlertSeverity
  status: "OPEN"
  lastValue: number
  updatedAt: string
  lastSentAt: string
}

type AlertStateFile = Record<string, PersistedAlertState>

type AlertCandidate = {
  key: string
  category: AlertCategory
  severity: AlertSeverity
  message: string
  value: number
  criticalRepeatMinutes?: number
}

type IndexerHealthConfig = {
  indexers: Record<IndexerExecutionName, IndexerHealthIndexerConfig>
}

const INDEXER_HEALTH_TITLE = "Indexer health alerts triggered"
const INDEXER_HEALTH_RESOLVED_TITLE = "Indexer health alerts resolved"
const MINUTES_MS = 60 * 1000

export class IndexerHealthAlertService {
  private readonly indexerExecutionLogRepository: IndexerExecutionLogRepository
  private readonly telegramNotifierService: TelegramNotifierService
  private readonly stateFilePath: string
  private readonly config: IndexerHealthConfig

  constructor(
    indexerExecutionLogRepository: IndexerExecutionLogRepository,
    telegramNotifierService: TelegramNotifierService,
    stateFilePath: string,
    config: IndexerHealthConfig = monitoringModuleConfig.indexer_health
  ) {
    this.indexerExecutionLogRepository = indexerExecutionLogRepository
    this.telegramNotifierService = telegramNotifierService
    this.stateFilePath = stateFilePath
    this.config = config
  }

  async processAlerts(referenceDate = new Date()) {
    const monitoredIndexerNames = this.getMonitoredIndexerNames()
    const healthSummaries = await this.indexerExecutionLogRepository.getLatestHealthSummaryByIndexer(monitoredIndexerNames)

    const staleCandidates = this.buildStaleAlerts(monitoredIndexerNames, healthSummaries, referenceDate)
    const failureCandidates = this.buildFailureAlerts(monitoredIndexerNames, healthSummaries)

    await this.flushAlerts([...staleCandidates, ...failureCandidates], referenceDate)
  }

  private getMonitoredIndexerNames(): IndexerExecutionName[] {
    return (Object.values(INDEXER_EXECUTION_NAMES) as IndexerExecutionName[]).filter((indexerName) => this.config.indexers[indexerName]?.enabled)
  }

  private buildStaleAlerts(
    indexerNames: IndexerExecutionName[],
    healthSummaries: Awaited<ReturnType<IndexerExecutionLogRepository["getLatestHealthSummaryByIndexer"]>>,
    referenceDate: Date
  ): AlertCandidate[] {
    const candidates: AlertCandidate[] = []

    for (const indexerName of indexerNames) {
      const indexerConfig = this.config.indexers[indexerName]
      const latestExecution = healthSummaries[indexerName]?.latestExecution
      const latestSuccess = healthSummaries[indexerName]?.latestSuccess

      if (!latestExecution) {
        continue
      }

      const minutesSinceLatestExecution = Math.max(0, Math.floor((referenceDate.getTime() - latestExecution.finishedAt.getTime()) / MINUTES_MS))
      const minutesSinceHealthy = latestSuccess
        ? Math.max(0, Math.floor((referenceDate.getTime() - latestSuccess.finishedAt.getTime()) / MINUTES_MS))
        : minutesSinceLatestExecution
      const severity = latestSuccess
        ? this.getStaleSeverity(minutesSinceHealthy, indexerConfig)
        : this.getNeverSucceededSeverity(minutesSinceLatestExecution, indexerConfig)

      if (!severity) {
        continue
      }

      const lastSuccessLabel = latestSuccess ? latestSuccess.finishedAt.toISOString() : "never"
      const latestExecutionLabel = latestSuccess ? "" : `, latest execution ${latestExecution.status} at ${latestExecution.finishedAt.toISOString()}`
      const staleDurationLabel = latestSuccess ? `for ${minutesSinceHealthy}m` : "ever"
      candidates.push({
        key: `INDEXER_STALE:${indexerName}`,
        category: "STALE",
        severity,
        value: minutesSinceHealthy,
        criticalRepeatMinutes: indexerConfig.criticalRepeatMinutes,
        message: `[${severity}] ${indexerName}: no successful run ${staleDurationLabel} (last success ${lastSuccessLabel}${latestExecutionLabel})`,
      })
    }

    return candidates
  }

  private buildFailureAlerts(
    indexerNames: IndexerExecutionName[],
    healthSummaries: Awaited<ReturnType<IndexerExecutionLogRepository["getLatestHealthSummaryByIndexer"]>>
  ): AlertCandidate[] {
    const candidates: AlertCandidate[] = []

    for (const indexerName of indexerNames) {
      const indexerConfig = this.config.indexers[indexerName]
      const maxConsecutiveFailures = Math.max(1, Math.floor(indexerConfig.maxConsecutiveFailures))
      const consecutiveFailures = healthSummaries[indexerName]?.consecutiveFailures ?? 0

      if (consecutiveFailures < maxConsecutiveFailures) {
        continue
      }

      candidates.push({
        key: `INDEXER_FAILURES:${indexerName}`,
        category: "FAILURES",
        severity: "WARNING",
        value: consecutiveFailures,
        message: `[WARNING] ${indexerName}: ${consecutiveFailures} consecutive failures since last success`,
      })
    }

    return candidates
  }

  private getStaleSeverity(minutesSinceSuccess: number, indexerConfig: IndexerHealthIndexerConfig): AlertSeverity | null {
    if (minutesSinceSuccess >= indexerConfig.criticalAfterMinutes) {
      return "CRITICAL"
    }
    if (minutesSinceSuccess >= indexerConfig.warningAfterMinutes) {
      return "WARNING"
    }
    return null
  }

  private getNeverSucceededSeverity(minutesSinceLatestExecution: number, indexerConfig: IndexerHealthIndexerConfig): AlertSeverity {
    if (minutesSinceLatestExecution >= indexerConfig.criticalAfterMinutes) {
      return "CRITICAL"
    }
    return "WARNING"
  }

  private async flushAlerts(alertCandidates: AlertCandidate[], referenceDate: Date) {
    const previousState = await this.readState()
    const nextState: AlertStateFile = {}
    const triggeredCandidates: AlertCandidate[] = []
    const resolvedMessages: string[] = []

    for (const candidate of alertCandidates) {
      const previous = previousState[candidate.key]
      const shouldSend = !previous || previous.severity !== candidate.severity || this.shouldRepeatCritical(candidate, previous, referenceDate)

      nextState[candidate.key] = {
        severity: candidate.severity,
        status: "OPEN",
        lastValue: candidate.value,
        updatedAt: referenceDate.toISOString(),
        lastSentAt: shouldSend ? referenceDate.toISOString() : (previous?.lastSentAt ?? referenceDate.toISOString()),
      }

      if (shouldSend) {
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
      await this.telegramNotifierService.sendMessage(this.buildTriggeredBatchMessage(triggeredCandidates))
    }

    if (resolvedMessages.length > 0) {
      await this.telegramNotifierService.sendMessage(this.buildResolvedBatchMessage(resolvedMessages))
    }

    await this.writeState(nextState)
  }

  private shouldRepeatCritical(candidate: AlertCandidate, previous: PersistedAlertState | undefined, referenceDate: Date): boolean {
    if (!previous || candidate.severity !== "CRITICAL" || previous.severity !== "CRITICAL" || !candidate.criticalRepeatMinutes) {
      return false
    }

    const lastSentAt = new Date(previous.lastSentAt)
    if (Number.isNaN(lastSentAt.getTime())) {
      return true
    }

    return referenceDate.getTime() - lastSentAt.getTime() >= candidate.criticalRepeatMinutes * MINUTES_MS
  }

  private buildTriggeredBatchMessage(candidates: AlertCandidate[]) {
    const staleMessages = candidates.filter((candidate) => candidate.category === "STALE").map((candidate) => `- ${candidate.message}`)
    const failureMessages = candidates.filter((candidate) => candidate.category === "FAILURES").map((candidate) => `- ${candidate.message}`)
    const lines = [INDEXER_HEALTH_TITLE]

    if (staleMessages.length > 0) {
      lines.push("")
      lines.push("Stale indexers")
      lines.push(...staleMessages)
    }

    if (failureMessages.length > 0) {
      lines.push("")
      lines.push("Failure accumulation")
      lines.push(...failureMessages)
    }

    return lines.join("\n")
  }

  private buildResolvedBatchMessage(messages: string[]) {
    return [INDEXER_HEALTH_RESOLVED_TITLE, "", ...messages.map((message) => `- ${message}`)].join("\n")
  }

  private buildResolvedMessage(key: string, previous: PersistedAlertState) {
    const [, indexerName] = key.split(":")
    return `[RESOLVED] ${indexerName} back to normal (last ${previous.severity.toLowerCase()} value ${previous.lastValue})`
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
      if (this.isPersistedAlertState(value)) {
        nextState[key] = value
      }
    }

    return nextState
  }

  private isPersistedAlertState(value: unknown): value is PersistedAlertState {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false
    }

    const candidate = value as Partial<PersistedAlertState>
    return (
      (candidate.severity === "WARNING" || candidate.severity === "CRITICAL") &&
      candidate.status === "OPEN" &&
      typeof candidate.lastValue === "number" &&
      Number.isFinite(candidate.lastValue) &&
      typeof candidate.updatedAt === "string" &&
      typeof candidate.lastSentAt === "string"
    )
  }
}
