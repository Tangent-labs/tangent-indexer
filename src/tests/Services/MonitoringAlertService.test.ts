import fs from "fs"
import os from "os"
import path from "path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MonitoringAlertService } from "../../services/MonitoringAlertService.js"

describe("MonitoringAlertService", () => {
  const sendMessage = vi.fn().mockResolvedValue(true)
  let stateFilePath: string

  beforeEach(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitoring-alerts-"))
    stateFilePath = path.join(tempDir, "state.json")
    sendMessage.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("sends alert on first peg breach and does not duplicate it on the next run", async () => {
    const repository = {
      getLatestPegSnapshots: vi
        .fn()
        .mockResolvedValueOnce([
          {
            deviation_pct: 2.4,
            token: { address: "0xabc", symbol: "USDT", peg_type: "USD" },
          },
        ])
        .mockResolvedValueOnce([
          {
            deviation_pct: 2.3,
            token: { address: "0xabc", symbol: "USDT", peg_type: "USD" },
          },
        ]),
      getLatestOracleSnapshots: vi.fn().mockResolvedValue([]),
      getLatestGlobalHistory: vi.fn().mockResolvedValue(null),
      getLatestPositionRiskSnapshotsWithin24h: vi.fn().mockResolvedValue([]),
      getGlobalHistoryAtOrBefore: vi.fn().mockResolvedValue(null),
    }

    const service = new MonitoringAlertService(repository as any, { sendMessage } as any, stateFilePath)

    await service.processAlerts(new Date("2026-03-24T10:00:00Z"))
    await service.processAlerts(new Date("2026-03-24T10:10:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][0]).toContain("[WARNING] USDT")
  })

  it("escalates an existing alert when severity increases", async () => {
    const repository = {
      getLatestPegSnapshots: vi
        .fn()
        .mockResolvedValueOnce([
          {
            deviation_pct: 2.1,
            token: { address: "0xabc", symbol: "USDT", peg_type: "USD" },
          },
        ])
        .mockResolvedValueOnce([
          {
            deviation_pct: 5.2,
            token: { address: "0xabc", symbol: "USDT", peg_type: "USD" },
          },
        ]),
      getLatestOracleSnapshots: vi.fn().mockResolvedValue([]),
      getLatestGlobalHistory: vi.fn().mockResolvedValue(null),
      getLatestPositionRiskSnapshotsWithin24h: vi.fn().mockResolvedValue([]),
      getGlobalHistoryAtOrBefore: vi.fn().mockResolvedValue(null),
    }

    const service = new MonitoringAlertService(repository as any, { sendMessage } as any, stateFilePath)

    await service.processAlerts(new Date("2026-03-24T10:00:00Z"))
    await service.processAlerts(new Date("2026-03-24T10:10:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage.mock.calls[1][0]).toContain("[DANGER] USDT")
  })

  it("sends a resolved message when an alert clears", async () => {
    const repository = {
      getLatestPegSnapshots: vi
        .fn()
        .mockResolvedValueOnce([
          {
            deviation_pct: 2.4,
            token: { address: "0xabc", symbol: "USDT", peg_type: "USD" },
          },
        ])
        .mockResolvedValueOnce([]),
      getLatestOracleSnapshots: vi.fn().mockResolvedValue([]),
      getLatestGlobalHistory: vi.fn().mockResolvedValue(null),
      getLatestPositionRiskSnapshotsWithin24h: vi.fn().mockResolvedValue([]),
      getGlobalHistoryAtOrBefore: vi.fn().mockResolvedValue(null),
    }

    const service = new MonitoringAlertService(repository as any, { sendMessage } as any, stateFilePath)

    await service.processAlerts(new Date("2026-03-24T10:00:00Z"))
    await service.processAlerts(new Date("2026-03-24T10:10:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage.mock.calls[1][0]).toContain("[RESOLVED]")
  })

  it("sends TVL alerts for 1h and 24h drops above threshold in a single message", async () => {
    const repository = {
      getLatestPegSnapshots: vi.fn().mockResolvedValue([]),
      getLatestOracleSnapshots: vi.fn().mockResolvedValue([]),
      getLatestGlobalHistory: vi.fn().mockResolvedValue({
        total_tvl: 80,
      }),
      getLatestPositionRiskSnapshotsWithin24h: vi.fn().mockResolvedValue([]),
      getGlobalHistoryAtOrBefore: vi.fn().mockResolvedValueOnce({ total_tvl: 100 }).mockResolvedValueOnce({ total_tvl: 120 }),
    }

    const service = new MonitoringAlertService(repository as any, { sendMessage } as any, stateFilePath)

    await service.processAlerts(new Date("2026-03-24T10:00:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][0]).toContain("TVL")
    expect(sendMessage.mock.calls[0][0]).toContain("[DANGER] TVL down")
    expect(sendMessage.mock.calls[0][0]).toContain("over 1h")
    expect(sendMessage.mock.calls[0][0]).toContain("over 24h")
  })

  it("groups different alert types from the same run into one triggered message", async () => {
    const repository = {
      getLatestPegSnapshots: vi.fn().mockResolvedValue([
        {
          deviation_pct: 2.4,
          token: { address: "0xabc", symbol: "USDT", peg_type: "USD" },
        },
      ]),
      getLatestOracleSnapshots: vi.fn().mockResolvedValue([
        {
          deviation_pct: 5.3,
          oracle_price: 0.945,
          offchain_price: 1.0,
          market: { contract_address: "0xmarket", contract_name: "USDT Market" },
        },
      ]),
      getLatestGlobalHistory: vi.fn().mockResolvedValue(null),
      getLatestPositionRiskSnapshotsWithin24h: vi.fn().mockResolvedValue([]),
      getGlobalHistoryAtOrBefore: vi.fn().mockResolvedValue(null),
    }

    const service = new MonitoringAlertService(repository as any, { sendMessage } as any, stateFilePath)

    await service.processAlerts(new Date("2026-03-24T10:00:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][0]).toContain("Monitoring alerts triggered")
    expect(sendMessage.mock.calls[0][0]).toContain("https://analytics.tangent.finance/")
    expect(sendMessage.mock.calls[0][0]).toContain("Peg")
    expect(sendMessage.mock.calls[0][0]).toContain("Oracle sanity")
    expect(sendMessage.mock.calls[0][0]).toContain("[WARNING] USDT")
    expect(sendMessage.mock.calls[0][0]).toContain("[DANGER] USDT Market")
  })

  it("groups collateralization and liquidation distance alerts per position", async () => {
    const repository = {
      getLatestPegSnapshots: vi.fn().mockResolvedValue([]),
      getLatestOracleSnapshots: vi.fn().mockResolvedValue([]),
      getLatestGlobalHistory: vi.fn().mockResolvedValue(null),
      getGlobalHistoryAtOrBefore: vi.fn().mockResolvedValue(null),
      getLatestPositionRiskSnapshotsWithin24h: vi.fn().mockResolvedValue([
        {
          market_id: 1n,
          borrower_address: "0xborrower",
          cr: 1.31,
          distance_pct: 0.4,
          liquidation_price: 0.98,
          position_value_usd: 1000,
          user_debt: 800,
          snapshot_timestamp: new Date("2026-03-24T10:00:00Z"),
          contract_name: "USDT Market",
          contract_address: "0xmarket",
          liquidation_threshold: 0.8,
        },
      ]),
    }

    const service = new MonitoringAlertService(repository as any, { sendMessage } as any, stateFilePath)

    await service.processAlerts(new Date("2026-03-24T10:00:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][0]).toContain("Collateralization")
    expect(sendMessage.mock.calls[0][0]).toContain("Liquidation distance")
    expect(sendMessage.mock.calls[0][0]).toContain("[CRITICAL] USDT Market / 0xborrower")
  })

  it("shortens long borrower addresses in position alerts", async () => {
    const repository = {
      getLatestPegSnapshots: vi.fn().mockResolvedValue([]),
      getLatestOracleSnapshots: vi.fn().mockResolvedValue([]),
      getLatestGlobalHistory: vi.fn().mockResolvedValue(null),
      getGlobalHistoryAtOrBefore: vi.fn().mockResolvedValue(null),
      getLatestPositionRiskSnapshotsWithin24h: vi.fn().mockResolvedValue([
        {
          market_id: 1n,
          borrower_address: "0x0000000000000000000000000000000000000bad",
          cr: 1.2,
          distance_pct: 0.4,
          liquidation_price: 0.98,
          position_value_usd: 1000,
          user_debt: 800,
          snapshot_timestamp: new Date("2026-03-24T10:00:00Z"),
          contract_name: "Convex CRV",
          contract_address: "0xmarket",
          liquidation_threshold: 0.8,
        },
      ]),
    }

    const service = new MonitoringAlertService(repository as any, { sendMessage } as any, stateFilePath)

    await service.processAlerts(new Date("2026-03-24T10:00:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][0]).toContain("0x0000...0bad")
  })

  it("ignores a corrupted state file and still emits the next alert", async () => {
    fs.writeFileSync(stateFilePath, "{not-valid-json")

    const repository = {
      getLatestPegSnapshots: vi.fn().mockResolvedValue([
        {
          deviation_pct: 2.4,
          token: { address: "0xabc", symbol: "USDT", peg_type: "USD" },
        },
      ]),
      getLatestOracleSnapshots: vi.fn().mockResolvedValue([]),
      getLatestGlobalHistory: vi.fn().mockResolvedValue(null),
      getLatestPositionRiskSnapshotsWithin24h: vi.fn().mockResolvedValue([]),
      getGlobalHistoryAtOrBefore: vi.fn().mockResolvedValue(null),
    }

    const service = new MonitoringAlertService(repository as any, { sendMessage } as any, stateFilePath)

    await service.processAlerts(new Date("2026-03-24T10:00:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][0]).toContain("[WARNING] USDT")
  })

  it("alerts as WARNING when CR is exactly on the warning boundary", async () => {
    const repository = {
      getLatestPegSnapshots: vi.fn().mockResolvedValue([]),
      getLatestOracleSnapshots: vi.fn().mockResolvedValue([]),
      getLatestGlobalHistory: vi.fn().mockResolvedValue(null),
      getGlobalHistoryAtOrBefore: vi.fn().mockResolvedValue(null),
      getLatestPositionRiskSnapshotsWithin24h: vi.fn().mockResolvedValue([
        {
          market_id: 1n,
          borrower_address: "0xborrower",
          cr: 1.5,
          distance_pct: 5,
          liquidation_price: 0.98,
          position_value_usd: 1000,
          user_debt: 800,
          snapshot_timestamp: new Date("2026-03-24T10:00:00Z"),
          contract_name: "USDT Market",
          contract_address: "0xmarket",
          liquidation_threshold: 0.8,
        },
      ]),
    }

    const service = new MonitoringAlertService(repository as any, { sendMessage } as any, stateFilePath)

    await service.processAlerts(new Date("2026-03-24T10:00:00Z"))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][0]).toContain("[WARNING] USDT Market / 0xborrower: CR 1.500")
  })
})
