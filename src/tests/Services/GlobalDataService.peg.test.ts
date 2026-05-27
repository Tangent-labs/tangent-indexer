import { describe, it, expect } from "vitest"
import { JsonRpcProvider } from "ethers"
import { GlobalDataService } from "../../services/globalData/GlobalDataService.js"
import { Prices } from "../../services/globalData/types.js"
import { peg_monitored_tokens } from "@prisma/client"

// Minimal stubs for constructor dependencies – only peg methods are exercised
function buildService(): GlobalDataService {
  return new GlobalDataService(
    {} as JsonRpcProvider,
    {} as any, // callApiService
    {} as any, // erc20Repository
    {} as any, // globalDataRepository
    {} as any, // totalSupplyRepository
    {} as any, // pegKeeperRepository
    {} as any, // wStableRepository
    {} as any, // globalHistoryDataRepository
    {} as any, // marketContractsRepository
    {} as any // pegMonitoredTokenRepository
  )
}

// Helper to build a Prices entry
function priceEntry(price: number, decimals = 18): Prices[string] {
  return { price, decimals, symbol: "", timestamp: 0, confidence: 1 }
}

// Helper to build a peg_monitored_tokens entry with defaults
function token(overrides: Partial<peg_monitored_tokens> & Pick<peg_monitored_tokens, "id" | "address" | "peg_type">): peg_monitored_tokens {
  return {
    ref_address: null,
    active: true,
    symbol: "X",
    warning_pct: 0.01,
    critical_pct: 0.05,
    ...overrides,
  } as peg_monitored_tokens
}

const NOW = new Date("2025-06-01T00:00:00Z")

// ─── buildPegSanitySnapshots ────────────────────────────────────────

describe("GlobalDataService – buildPegSanitySnapshots", () => {
  const service = buildService()
  // Access private method via bracket notation
  const build = (tokens: peg_monitored_tokens[], prices: Prices) => (service as any).buildPegSanitySnapshots(tokens, prices, NOW)

  it("should compute deviation for a USD-pegged token", () => {
    const tokens = [token({ id: 1n, address: "0xUSG", peg_type: "USD", symbol: "USG" })]
    const prices: Prices = { "0xusg": priceEntry(0.995) }

    const rows = build(tokens, prices)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      token_id: 1n,
      price: 0.995,
      ref_price: 1.0,
      timestamp: NOW,
    })
    expect(rows[0].deviation_pct).toBeCloseTo(0.5, 5)
  })

  it("should compute deviation for an ETH-pegged token", () => {
    const tokens = [token({ id: 2n, address: "0xWSTETH", peg_type: "ETH", ref_address: "0xWETH", symbol: "wstETH" })]
    const prices: Prices = {
      "0xwsteth": priceEntry(2500),
      "0xweth": priceEntry(2480),
    }

    const rows = build(tokens, prices)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      token_id: 2n,
      price: 2500,
      ref_price: 2480,
    })
    // |2500 - 2480| / 2480 * 100 ≈ 0.8065%
    expect(rows[0].deviation_pct).toBeCloseTo(0.8065, 2)
  })

  it("should compute deviation for a BTC-pegged token", () => {
    const tokens = [token({ id: 3n, address: "0xTBTC", peg_type: "BTC", ref_address: "0xWBTC", symbol: "tBTC" })]
    const prices: Prices = {
      "0xtbtc": priceEntry(68000),
      "0xwbtc": priceEntry(67500),
    }

    const rows = build(tokens, prices)

    expect(rows).toHaveLength(1)
    expect(rows[0].ref_price).toBe(67500)
    // |68000 - 67500| / 67500 * 100 ≈ 0.7407%
    expect(rows[0].deviation_pct).toBeCloseTo(0.7407, 2)
  })

  it("should skip volatile peg comparison when quote timestamps are not aligned", () => {
    const tokens = [token({ id: 2n, address: "0xSTETH", peg_type: "ETH", ref_address: "0xWETH", symbol: "stETH" })]
    const prices: Prices = {
      "0xsteth": { ...priceEntry(2425), timestamp: 1_000 },
      "0xweth": { ...priceEntry(2500), timestamp: 1_301 },
    }

    const rows = build(tokens, prices)

    expect(rows).toHaveLength(0)
  })

  it("should compare volatile peg quotes within the accepted timestamp skew", () => {
    const tokens = [token({ id: 2n, address: "0xSTETH", peg_type: "ETH", ref_address: "0xWETH", symbol: "stETH" })]
    const prices: Prices = {
      "0xsteth": { ...priceEntry(2495), timestamp: 1_000 },
      "0xweth": { ...priceEntry(2500), timestamp: 1_300 },
    }

    const rows = build(tokens, prices)

    expect(rows).toHaveLength(1)
    expect(rows[0].deviation_pct).toBeCloseTo(0.2, 5)
  })

  it("should skip token when price is missing", () => {
    const tokens = [token({ id: 1n, address: "0xMISSING", peg_type: "USD" })]
    const rows = build(tokens, {})
    expect(rows).toHaveLength(0)
  })

  it("should skip ETH/BTC token when ref_address is null", () => {
    const tokens = [token({ id: 1n, address: "0xTOKEN", peg_type: "ETH" })]
    const prices: Prices = { "0xtoken": priceEntry(2500) }

    const rows = build(tokens, prices)
    expect(rows).toHaveLength(0)
  })

  it("should skip ETH/BTC token when ref price is missing", () => {
    const tokens = [token({ id: 1n, address: "0xTOKEN", peg_type: "ETH", ref_address: "0xREF" })]
    const prices: Prices = { "0xtoken": priceEntry(2500) }

    const rows = build(tokens, prices)
    expect(rows).toHaveLength(0)
  })

  it("should skip token with unknown peg_type", () => {
    const tokens = [token({ id: 1n, address: "0xTOKEN", peg_type: "GOLD" })]
    const prices: Prices = { "0xtoken": priceEntry(1800) }

    const rows = build(tokens, prices)
    expect(rows).toHaveLength(0)
  })

  it("should skip token when ref price is zero", () => {
    const tokens = [token({ id: 1n, address: "0xTOKEN", peg_type: "ETH", ref_address: "0xREF" })]
    const prices: Prices = {
      "0xtoken": priceEntry(2500),
      "0xref": priceEntry(0),
    }

    const rows = build(tokens, prices)
    expect(rows).toHaveLength(0)
  })

  it("should handle multiple tokens mixing USD, ETH and skipped entries", () => {
    const tokens = [
      token({ id: 1n, address: "0xA", peg_type: "USD", symbol: "A" }),
      token({ id: 2n, address: "0xB", peg_type: "ETH", ref_address: "0xWETH", symbol: "B" }),
      token({ id: 3n, address: "0xC", peg_type: "USD", symbol: "C" }), // missing price
    ]
    const prices: Prices = {
      "0xa": priceEntry(1.001),
      "0xb": priceEntry(2500),
      "0xweth": priceEntry(2500),
    }

    const rows = build(tokens, prices)

    expect(rows).toHaveLength(2)
    expect(rows[0].token_id).toBe(1n)
    expect(rows[1].token_id).toBe(2n)
    // B pegged perfectly → 0% deviation
    expect(rows[1].deviation_pct).toBeCloseTo(0, 5)
  })

  it("should return empty array for empty monitored tokens", () => {
    const rows = build([], { "0xa": priceEntry(1) })
    expect(rows).toHaveLength(0)
  })
})
