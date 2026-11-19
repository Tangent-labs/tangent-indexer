import { describe, expect, it } from "vitest"
import { shouldCheckpoint } from "../../services/OnchainTxBotService.js"

describe("shouldCheckpoint", () => {
  it("ignores big relative moves on small values", () => expect(shouldCheckpoint(0.002, 0.004, 0.5, 25)).toBe(false))
  it("ignores small relative moves on big values", () => expect(shouldCheckpoint(0.2, 0.21, 0.5, 25)).toBe(false))
  it("triggers when both thresholds pass", () => expect(shouldCheckpoint(0.04, 0.06, 0.5, 25)).toBe(true))
  it("triggers from zero past the abs floor", () => expect(shouldCheckpoint(0, 0.01, 0.5, 25)).toBe(true))
  it("no-op on zero to zero", () => expect(shouldCheckpoint(0, 0, 0.5, 25)).toBe(false))
})
