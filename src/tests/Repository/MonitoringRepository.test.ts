import { PrismaClient } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MonitoringRepository } from "../../db/MonitoringRepository.js"

describe("MonitoringRepository", () => {
  const queryRaw = vi.fn().mockResolvedValue([])
  let repository: MonitoringRepository

  beforeEach(() => {
    queryRaw.mockClear()
    repository = new MonitoringRepository({ $queryRaw: queryRaw } as unknown as PrismaClient)
  })

  it("queries the latest risk snapshot for each active position without expiring unchanged positions", async () => {
    await repository.getLatestActivePositionRiskSnapshots()

    expect(queryRaw).toHaveBeenCalledTimes(1)

    const query = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?")
    expect(query).toContain("FROM global.active_borrowers")
    expect(query).toContain("CROSS JOIN LATERAL")
    expect(query).toContain("ORDER BY s.snapshot_timestamp DESC")
    expect(query).toContain("LIMIT 1")
    expect(query).toContain("FROM latest_position_snapshots ps")
    expect(query).not.toContain("target_snapshot")
    expect(query).not.toContain("snapshot_timestamp >=")
  })
})
