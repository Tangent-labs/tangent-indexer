import { describe, expect, it, vi } from "vitest"

import { IndexerExecutionLogService } from "../../services/IndexerExecutionLogService.js"
import { INDEXER_EXECUTION_NAMES, INDEXER_EXECUTION_STATUS } from "../../type/indexerExecution.js"

describe("IndexerExecutionLogService", () => {
  it("records a successful execution", async () => {
    const repository = {
      insertExecution: vi.fn().mockResolvedValue(undefined),
    }

    const service = new IndexerExecutionLogService(repository as any)

    await service.run(INDEXER_EXECUTION_NAMES.BLOCK, async () => "ok")

    expect(repository.insertExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        indexerName: INDEXER_EXECUTION_NAMES.BLOCK,
        status: INDEXER_EXECUTION_STATUS.SUCCESS,
        errorMessage: null,
      })
    )
  })

  it("records a failed execution and rethrows the original error", async () => {
    const repository = {
      insertExecution: vi.fn().mockResolvedValue(undefined),
    }

    const service = new IndexerExecutionLogService(repository as any)

    await expect(
      service.run(INDEXER_EXECUTION_NAMES.POINTS_LP, async () => {
        throw new Error("boom")
      })
    ).rejects.toThrow("boom")

    expect(repository.insertExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        indexerName: INDEXER_EXECUTION_NAMES.POINTS_LP,
        status: INDEXER_EXECUTION_STATUS.FAILED,
        errorMessage: "boom",
      })
    )
  })

  it("does not fail the business execution when success logging fails", async () => {
    const repository = {
      insertExecution: vi.fn().mockRejectedValue(new Error("relation does not exist")),
    }

    const service = new IndexerExecutionLogService(repository as any)
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(service.run(INDEXER_EXECUTION_NAMES.GLOBAL_DATA, async () => "ok")).resolves.toBe("ok")
  })
})
