import { describe, it, expect, vi, beforeEach } from "vitest"
import { RevenuesService } from "../../services/events/RevenuesService.js"
import { RevenuesRepository } from "../../db/RevenuesRepository.js"

import { defiLLamaFetchPricesHistorical } from "../../services/globalData/DefiLLamaPriceFetcher.js"

vi.mock("../../services/globalData/DefiLLamaPriceFetcher.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/globalData/DefiLLamaPriceFetcher.js")>()
  return {
    ...actual,
    defiLLamaFetchPricesHistorical: vi.fn(),
  }
})

const CRV_TOKEN = { id: 1n, address: "0xcrv", name: "CRV", decimals: 18 }

function utcDay(iso: string) {
  const d = new Date(iso)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function buildRepository(overrides: Partial<Record<keyof RevenuesRepository, any>> = {}) {
  return {
    getRewardTokenPrices: vi.fn().mockResolvedValue([]),
    getRevenuesTokens: vi.fn().mockResolvedValue([CRV_TOKEN]),
    saveRewardTokenPrices: vi.fn().mockResolvedValue(undefined),
    getUSGMintedInterests: vi.fn().mockResolvedValue([]),
    getRewardCuts: vi.fn().mockResolvedValue([]),
    getDailyRevenues: vi.fn().mockResolvedValue([]),
    saveDailyRevenues: vi.fn().mockResolvedValue(undefined),
    getDailyRevenuesMarket: vi.fn().mockResolvedValue([]),
    saveDailyRevenuesMarket: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any as RevenuesRepository
}

describe("RevenuesService.computeRevenuesForRange", () => {
  beforeEach(() => {
    vi.mocked(defiLLamaFetchPricesHistorical).mockReset()
  })

  it("splits USG interest and priced reward cuts into ir_revenue/rewards_revenue, both globally and per market", async () => {
    const today = utcDay("2026-04-02")
    const yesterday = utcDay("2026-04-01")

    const repository = buildRepository({
      getRewardTokenPrices: vi.fn().mockResolvedValue([{ day: yesterday, price: 0.5, token_id: 1n }]),
      getUSGMintedInterests: vi.fn().mockResolvedValue([{ block_date: today, market_id: 10n, interest: "2000000000000000000" }]),
      getRewardCuts: vi.fn().mockResolvedValue([{ block_date: today, market_id: 10n, token_id: 1n, reward_cut: "1000000000000000000" }]),
    })

    const service = new RevenuesService(repository)
    await service.computeRevenuesForRange(today, today)

    expect(defiLLamaFetchPricesHistorical).not.toHaveBeenCalled()
    expect(repository.saveDailyRevenues).toHaveBeenCalledWith([{ day: today, ir_revenue: 2, rewards_revenue: 0.5 }])
    expect(repository.saveDailyRevenuesMarket).toHaveBeenCalledWith([{ day: today, market_id: 10n, ir_revenue: 2, rewards_revenue: 0.5 }])
  })

  it("fetches and persists yesterday's price from DefiLlama when missing, then uses it to price today's reward cuts", async () => {
    const today = utcDay("2026-04-02")
    const yesterday = utcDay("2026-04-01")

    vi.mocked(defiLLamaFetchPricesHistorical).mockResolvedValue({
      "0xcrv": { decimals: 18, symbol: "CRV", price: 0.8, timestamp: 0, confidence: 1 },
    })

    const repository = buildRepository({
      getRewardTokenPrices: vi.fn().mockResolvedValue([]),
      getRewardCuts: vi.fn().mockResolvedValue([{ block_date: today, market_id: 10n, token_id: 1n, reward_cut: "1000000000000000000" }]),
    })

    const service = new RevenuesService(repository)
    await service.computeRevenuesForRange(today, today)

    expect(defiLLamaFetchPricesHistorical).toHaveBeenCalledWith(expect.any(Number), ["0xcrv"], 12)
    expect(repository.saveRewardTokenPrices).toHaveBeenCalledWith([{ day: yesterday, price: 0.8, token_id: 1n }])
    expect(repository.saveDailyRevenues).toHaveBeenCalledWith([{ day: today, ir_revenue: 0, rewards_revenue: 0.8 }])
    expect(repository.saveDailyRevenuesMarket).toHaveBeenCalledWith([{ day: today, market_id: 10n, ir_revenue: 0, rewards_revenue: 0.8 }])
  })

  it("skips days already computed but always recomputes today, and skips per-market inserts when a day has no activity", async () => {
    const dayOne = utcDay("2026-04-01")
    const dayTwo = utcDay("2026-04-02")

    const repository = buildRepository({
      // yesterday (dayOne) already has a price so DefiLlama isn't hit
      getRewardTokenPrices: vi.fn().mockResolvedValue([{ day: dayOne, price: 0.5, token_id: 1n }]),
      getDailyRevenues: vi.fn().mockResolvedValue([{ day: dayOne, ir_revenue: 5, rewards_revenue: 0 }]),
    })

    const service = new RevenuesService(repository)
    await service.computeRevenuesForRange(dayOne, dayTwo)

    expect(repository.saveDailyRevenues).toHaveBeenCalledWith([{ day: dayTwo, ir_revenue: 0, rewards_revenue: 0 }])
    expect(repository.saveDailyRevenuesMarket).not.toHaveBeenCalled()
  })

  it("counts USG interest but excludes reward cuts for tokens without a price, per market", async () => {
    const today = utcDay("2026-04-02")
    const yesterday = utcDay("2026-04-01")

    const repository = buildRepository({
      getRewardTokenPrices: vi.fn().mockResolvedValue([{ day: yesterday, price: 0.5, token_id: 1n }]),
      getUSGMintedInterests: vi.fn().mockResolvedValue([{ block_date: today, market_id: 20n, interest: "3000000000000000000" }]),
      // token_id 99n has no matching price row
      getRewardCuts: vi.fn().mockResolvedValue([{ block_date: today, market_id: 20n, token_id: 99n, reward_cut: "5000000000000000000" }]),
    })

    const service = new RevenuesService(repository)
    await service.computeRevenuesForRange(today, today)

    expect(defiLLamaFetchPricesHistorical).not.toHaveBeenCalled()
    expect(repository.saveDailyRevenues).toHaveBeenCalledWith([{ day: today, ir_revenue: 3, rewards_revenue: 0 }])
    expect(repository.saveDailyRevenuesMarket).toHaveBeenCalledWith([{ day: today, market_id: 20n, ir_revenue: 3, rewards_revenue: 0 }])
  })

  it("splits revenue across multiple markets on the same day", async () => {
    const today = utcDay("2026-04-02")
    const yesterday = utcDay("2026-04-01")

    const repository = buildRepository({
      getRewardTokenPrices: vi.fn().mockResolvedValue([{ day: yesterday, price: 0.5, token_id: 1n }]),
      getUSGMintedInterests: vi.fn().mockResolvedValue([
        { block_date: today, market_id: 10n, interest: "2000000000000000000" },
        { block_date: today, market_id: 20n, interest: "1000000000000000000" },
      ]),
      getRewardCuts: vi.fn().mockResolvedValue([{ block_date: today, market_id: 20n, token_id: 1n, reward_cut: "1000000000000000000" }]),
    })

    const service = new RevenuesService(repository)
    await service.computeRevenuesForRange(today, today)

    expect(repository.saveDailyRevenues).toHaveBeenCalledWith([{ day: today, ir_revenue: 3, rewards_revenue: 0.5 }])
    expect(repository.saveDailyRevenuesMarket).toHaveBeenCalledWith(
      expect.arrayContaining([
        { day: today, market_id: 10n, ir_revenue: 2, rewards_revenue: 0 },
        { day: today, market_id: 20n, ir_revenue: 1, rewards_revenue: 0.5 },
      ])
    )
    expect((repository.saveDailyRevenuesMarket as any).mock.calls[0][0]).toHaveLength(2)
  })
})
