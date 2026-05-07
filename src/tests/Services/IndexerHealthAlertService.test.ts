import fs from "fs"
import os from "os"
import path from "path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { IndexerHealthAlertService } from "../../services/IndexerHealthAlertService.js"
import { INDEXER_EXECUTION_NAMES, INDEXER_EXECUTION_STATUS, IndexerExecutionName } from "../../type/indexerExecution.js"

describe("IndexerHealthAlertService", () => {
  const sendMessage = vi.fn().mockResolvedValue(true)
  let stateFilePath: string

  beforeEach(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "indexer-health-alerts-"))
    stateFilePath = path.join(tempDir, "state.json")
    sendMessage.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("sends a stale warning when the latest success is older than the warning threshold", async () => {
    const repository = buildRepository({
      latestExecutions: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.SUCCESS, "2026-05-06T10:00:00Z"),
      },
      latestSuccesses: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.SUCCESS, "2026-05-06T10:00:00Z"),
      },
    })
    const service = new IndexerHealthAlertService(repository as any, { sendMessage } as any, stateFilePath, testConfig())

    await service.processAlerts(new Date("2026-05-06T10:18:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][0]).toContain("[WARNING] block_indexer: no successful run for 18m")
  })

  it("sends a failure accumulation warning when consecutive failures reach the threshold", async () => {
    const repository = buildRepository({
      latestExecutions: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.FAILED, "2026-05-06T10:10:00Z"),
      },
      latestSuccesses: {},
      consecutiveFailures: 3,
    })
    const service = new IndexerHealthAlertService(repository as any, { sendMessage } as any, stateFilePath, testConfig())

    await service.processAlerts(new Date("2026-05-06T10:12:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][0]).toContain("[WARNING] block_indexer: 3 consecutive failures since last success")
  })

  it("sends a stale warning when an indexer has executions but no recorded success", async () => {
    const repository = buildRepository({
      latestExecutions: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.FAILED, "2026-05-06T10:10:00Z"),
      },
      latestSuccesses: {},
      consecutiveFailures: 1,
    })
    const service = new IndexerHealthAlertService(repository as any, { sendMessage } as any, stateFilePath, testConfig())

    await service.processAlerts(new Date("2026-05-06T10:12:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][0]).toContain("[WARNING] block_indexer: no successful run ever (last success never")
    expect(sendMessage.mock.calls[0][0]).toContain("latest execution FAILED at 2026-05-06T10:10:00.000Z")
  })

  it("does not duplicate an unchanged warning on the next run", async () => {
    const repository = buildRepository({
      latestExecutions: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.SUCCESS, "2026-05-06T10:00:00Z"),
      },
      latestSuccesses: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.SUCCESS, "2026-05-06T10:00:00Z"),
      },
    })
    const service = new IndexerHealthAlertService(repository as any, { sendMessage } as any, stateFilePath, testConfig())

    await service.processAlerts(new Date("2026-05-06T10:18:00Z"))
    await service.processAlerts(new Date("2026-05-06T10:20:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it("repeats an open critical stale alert after the repeat threshold", async () => {
    const repository = buildRepository({
      latestExecutions: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.SUCCESS, "2026-05-06T10:00:00Z"),
      },
      latestSuccesses: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.SUCCESS, "2026-05-06T10:00:00Z"),
      },
    })
    const service = new IndexerHealthAlertService(repository as any, { sendMessage } as any, stateFilePath, testConfig())

    await service.processAlerts(new Date("2026-05-06T11:05:00Z"))
    await service.processAlerts(new Date("2026-05-06T12:05:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage.mock.calls[1][0]).toContain("[CRITICAL] block_indexer")
  })

  it("does not repeat an open critical stale alert before the repeat threshold", async () => {
    const repository = buildRepository({
      latestExecutions: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.SUCCESS, "2026-05-06T10:00:00Z"),
      },
      latestSuccesses: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.SUCCESS, "2026-05-06T10:00:00Z"),
      },
    })
    const service = new IndexerHealthAlertService(repository as any, { sendMessage } as any, stateFilePath, testConfig())

    await service.processAlerts(new Date("2026-05-06T11:05:00Z"))
    await service.processAlerts(new Date("2026-05-06T11:30:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it("sends a resolved message after a recent success", async () => {
    const repository = buildRepository({
      latestExecutions: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.SUCCESS, "2026-05-06T10:00:00Z"),
      },
      latestSuccesses: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.SUCCESS, "2026-05-06T10:00:00Z"),
      },
    })
    const service = new IndexerHealthAlertService(repository as any, { sendMessage } as any, stateFilePath, testConfig())

    await service.processAlerts(new Date("2026-05-06T10:18:00Z"))
    const recentSuccess = execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.SUCCESS, "2026-05-06T10:20:00Z")
    repository.getLatestHealthSummaryByIndexer.mockResolvedValue({
      [INDEXER_EXECUTION_NAMES.BLOCK]: {
        latestExecution: recentSuccess,
        latestSuccess: recentSuccess,
      },
    })
    await service.processAlerts(new Date("2026-05-06T10:21:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage.mock.calls[1][0]).toContain("[RESOLVED] block_indexer back to normal")
  })

  it("ignores disabled indexers", async () => {
    const repository = buildRepository({
      latestExecutions: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.SUCCESS, "2026-05-06T10:00:00Z"),
      },
      latestSuccesses: {
        [INDEXER_EXECUTION_NAMES.BLOCK]: execution(INDEXER_EXECUTION_NAMES.BLOCK, INDEXER_EXECUTION_STATUS.SUCCESS, "2026-05-06T10:00:00Z"),
      },
    })
    const service = new IndexerHealthAlertService(repository as any, { sendMessage } as any, stateFilePath, testConfig(false))

    await service.processAlerts(new Date("2026-05-06T12:00:00Z"))

    expect(sendMessage).not.toHaveBeenCalled()
    expect(repository.getLatestHealthSummaryByIndexer).toHaveBeenCalledWith([])
  })
})

function execution(indexerName: IndexerExecutionName, status: "SUCCESS" | "FAILED", finishedAt: string) {
  return {
    indexerName,
    status,
    startedAt: new Date(finishedAt),
    finishedAt: new Date(finishedAt),
  }
}

function buildRepository({
  latestExecutions,
  latestSuccesses,
  consecutiveFailures = 0,
}: {
  latestExecutions: Record<string, ReturnType<typeof execution>>
  latestSuccesses: Record<string, ReturnType<typeof execution>>
  consecutiveFailures?: number
}) {
  const healthSummaries = Object.fromEntries(
    Object.entries(latestExecutions).map(([indexerName, latestExecution]) => [
      indexerName,
      {
        latestExecution,
        latestSuccess: latestSuccesses[indexerName] ?? null,
        consecutiveFailures,
      },
    ])
  )

  return {
    getLatestHealthSummaryByIndexer: vi.fn().mockResolvedValue(healthSummaries),
  }
}

function testConfig(enabled = true) {
  return {
    indexers: {
      [INDEXER_EXECUTION_NAMES.BLOCK]: {
        enabled,
        warningAfterMinutes: 15,
        criticalAfterMinutes: 60,
        criticalRepeatMinutes: 60,
        maxConsecutiveFailures: 3,
      },
    },
  } as any
}
