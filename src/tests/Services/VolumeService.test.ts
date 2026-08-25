import { describe, it, expect, vi } from "vitest"
import { VolumeService } from "../../services/globalData/VolumeService.js"
import { VolumeRepository } from "../../db/VolumeRepository.js"

const USG = "0xb1c2db5d6ca03fce73dbd304d320bf76c55ae1b1"
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
const SUSG = "0xf17d6f98a5c6eaa99d149079984119e0a4ef6900"

// The factory is hoisted above the constants, so the addresses are inlined here
vi.mock("../../utils/jsonReader.js", () => ({
  getAddressesJson: vi.fn().mockResolvedValue({
    tokens: { USG: "0xb1c2db5d6ca03fce73dbd304d320bf76c55ae1b1", sUSG: "0xf17d6f98a5c6eaa99d149079984119e0a4ef6900" },
  }),
}))

function utcDay(iso: string) {
  const d = new Date(iso)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function emptyFlow(day: Date, marketId: bigint) {
  return { day, market_id: marketId, collateral_in: 0, collateral_out: 0, debt_in: 0, debt_out: 0 }
}

function emptyLpFlow(day: Date, lpId: bigint) {
  return {
    day,
    usg_lp_id: lpId,
    liquidity_in_token0: 0,
    liquidity_in_token1: 0,
    liquidity_out_token0: 0,
    liquidity_out_token1: 0,
    swap_token0: 0,
    swap_token1: 0,
  }
}

function emptyDailyVolume(day: Date) {
  return {
    day,
    collateral_in: 0,
    collateral_out: 0,
    debt_in: 0,
    debt_out: 0,
    lp_liquidity_in: 0,
    lp_liquidity_out: 0,
    lp_swap: 0,
    susg_in: 0,
    susg_out: 0,
  }
}

function buildRepository(overrides: Partial<Record<keyof VolumeRepository, any>> = {}) {
  return {
    getDailyMarketFlows: vi.fn().mockResolvedValue([]),
    getDailyCollateralPrices: vi.fn().mockResolvedValue([]),
    getDailyLpFlows: vi.fn().mockResolvedValue([]),
    getUsgLpKeys: vi.fn().mockResolvedValue([{ id: 1n, lp_name: "USG-USDC", token_0: USG, token_0_decimals: 18, token_1: USDC, token_1_decimals: 6 }]),
    getDailySusgFlows: vi.fn().mockResolvedValue([]),
    getDailyTokenPrices: vi.fn().mockResolvedValue([]),
    getDailyVolumes: vi.fn().mockResolvedValue([]),
    getDailyVolumesMarket: vi.fn().mockResolvedValue([]),
    getDailyVolumesLp: vi.fn().mockResolvedValue([]),
    saveDailyVolumes: vi.fn().mockResolvedValue(undefined),
    saveDailyVolumesMarket: vi.fn().mockResolvedValue(undefined),
    saveDailyVolumesLp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any as VolumeRepository
}

describe("VolumeService.computeVolumesForRange", () => {
  it("values collateral with the day's average oracle price and debt at $1, globally and per market", async () => {
    const today = utcDay("2026-04-02")

    const repository = buildRepository({
      getDailyMarketFlows: vi.fn().mockResolvedValue([
        { ...emptyFlow(today, 10n), collateral_in: 100, collateral_out: 40, debt_in: 500, debt_out: 200 },
        { ...emptyFlow(today, 11n), collateral_in: 10, debt_in: 5 },
      ]),
      getDailyCollateralPrices: vi.fn().mockResolvedValue([
        { day: today, market_id: 10n, avg_price: 2 },
        { day: today, market_id: 11n, avg_price: 0.5 },
      ]),
    })

    const service = new VolumeService(repository)
    await service.computeVolumesForRange(today, today)

    expect(repository.saveDailyVolumes).toHaveBeenCalledWith([
      { ...emptyDailyVolume(today), collateral_in: 205, collateral_out: 80, debt_in: 505, debt_out: 200 },
    ])
    expect(repository.saveDailyVolumesMarket).toHaveBeenCalledWith([
      { day: today, market_id: 10n, collateral_in: 200, collateral_out: 80, debt_in: 500, debt_out: 200 },
      { day: today, market_id: 11n, collateral_in: 5, collateral_out: 0, debt_in: 5, debt_out: 0 },
    ])
  })

  it("recomputes the last day of the range but skips days already closed out", async () => {
    const yesterday = utcDay("2026-04-01")
    const today = utcDay("2026-04-02")

    const repository = buildRepository({
      getDailyMarketFlows: vi.fn().mockResolvedValue([
        { ...emptyFlow(yesterday, 10n), debt_in: 999 },
        { ...emptyFlow(today, 10n), debt_in: 1 },
      ]),
      getDailyVolumes: vi.fn().mockResolvedValue([emptyDailyVolume(yesterday)]),
    })

    const service = new VolumeService(repository)
    await service.computeVolumesForRange(yesterday, today)

    expect(repository.saveDailyVolumes).toHaveBeenCalledWith([{ ...emptyDailyVolume(today), debt_in: 1 }])
    expect(repository.saveDailyVolumesMarket).toHaveBeenCalledWith([
      { day: today, market_id: 10n, collateral_in: 0, collateral_out: 0, debt_in: 1, debt_out: 0 },
    ])
  })

  it("falls back to the market's most recent earlier price when the day has none", async () => {
    const yesterday = utcDay("2026-04-01")
    const today = utcDay("2026-04-02")

    const repository = buildRepository({
      getDailyMarketFlows: vi.fn().mockResolvedValue([{ ...emptyFlow(today, 10n), collateral_in: 100 }]),
      getDailyCollateralPrices: vi.fn().mockResolvedValue([{ day: yesterday, market_id: 10n, avg_price: 3 }]),
    })

    const service = new VolumeService(repository)
    await service.computeVolumesForRange(yesterday, today)

    expect(repository.saveDailyVolumesMarket).toHaveBeenCalledWith([
      { day: today, market_id: 10n, collateral_in: 300, collateral_out: 0, debt_in: 0, debt_out: 0 },
    ])
  })

  it("still counts the debt and warns when a market has no oracle price at all", async () => {
    const today = utcDay("2026-04-02")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const repository = buildRepository({
      getDailyMarketFlows: vi.fn().mockResolvedValue([{ ...emptyFlow(today, 10n), collateral_in: 100, debt_in: 42 }]),
    })

    const service = new VolumeService(repository)
    await service.computeVolumesForRange(today, today)

    expect(warn).toHaveBeenCalledOnce()
    expect(repository.saveDailyVolumes).toHaveBeenCalledWith([{ ...emptyDailyVolume(today), debt_in: 42 }])

    warn.mockRestore()
  })

  it("scales each LP coin with its own decimals and counts only the USG leg of a swap", async () => {
    const today = utcDay("2026-04-02")

    const repository = buildRepository({
      getDailyLpFlows: vi.fn().mockResolvedValue([
        {
          ...emptyLpFlow(today, 1n),
          // 100 USG (18 dec) and 50 USDC (6 dec) added, 10 USG and 20 USDC removed
          liquidity_in_token0: 100e18,
          liquidity_in_token1: 50e6,
          liquidity_out_token0: 10e18,
          liquidity_out_token1: 20e6,
          // 30 USG swapped, the USDC leg must not be counted on top
          swap_token0: 30e18,
          swap_token1: 30e6,
        },
      ]),
    })

    const service = new VolumeService(repository)
    await service.computeVolumesForRange(today, today)

    expect(repository.saveDailyVolumesLp).toHaveBeenCalledWith([{ day: today, usg_lp_id: 1n, liquidity_in: 150, liquidity_out: 30, swap: 30 }])
    expect(repository.saveDailyVolumes).toHaveBeenCalledWith([{ ...emptyDailyVolume(today), lp_liquidity_in: 150, lp_liquidity_out: 30, lp_swap: 30 }])
  })

  it("reads the USG leg from the pool's coin order when USG is the second coin", async () => {
    const today = utcDay("2026-04-02")

    const repository = buildRepository({
      getUsgLpKeys: vi.fn().mockResolvedValue([{ id: 1n, lp_name: "USDC-USG", token_0: USDC, token_0_decimals: 6, token_1: USG, token_1_decimals: 18 }]),
      getDailyLpFlows: vi.fn().mockResolvedValue([{ ...emptyLpFlow(today, 1n), swap_token0: 30e6, swap_token1: 30e18 }]),
    })

    const service = new VolumeService(repository)
    await service.computeVolumesForRange(today, today)

    expect(repository.saveDailyVolumesLp).toHaveBeenCalledWith([{ day: today, usg_lp_id: 1n, liquidity_in: 0, liquidity_out: 0, swap: 30 }])
  })

  it("skips a pool holding neither USG nor sUSG rather than pricing the wrong leg at $1", async () => {
    const today = utcDay("2026-04-02")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"

    const repository = buildRepository({
      getUsgLpKeys: vi.fn().mockResolvedValue([{ id: 1n, lp_name: "msETH-WETH", token_0: WETH, token_0_decimals: 18, token_1: WETH, token_1_decimals: 18 }]),
      getDailyLpFlows: vi.fn().mockResolvedValue([{ ...emptyLpFlow(today, 1n), liquidity_in_token0: 100e18, swap_token1: 30e18 }]),
    })

    const service = new VolumeService(repository)
    await service.computeVolumesForRange(today, today)

    expect(warn).toHaveBeenCalledOnce()
    expect(repository.saveDailyVolumesLp).not.toHaveBeenCalled()
    expect(repository.saveDailyVolumes).toHaveBeenCalledWith([emptyDailyVolume(today)])

    warn.mockRestore()
  })

  it("prices the sUSG leg of a pool with its feed, not at $1", async () => {
    const today = utcDay("2026-04-02")
    const REUSD = "0x4cf9d48ea81ac25b3ca2577962ce93e15783523e"

    const repository = buildRepository({
      getUsgLpKeys: vi.fn().mockResolvedValue([{ id: 1n, lp_name: "sUSG-reUSD", token_0: SUSG, token_0_decimals: 18, token_1: REUSD, token_1_decimals: 18 }]),
      getDailyTokenPrices: vi.fn().mockResolvedValue([{ day: today, avg_price: 1.2 }]),
      getDailyLpFlows: vi.fn().mockResolvedValue([
        {
          ...emptyLpFlow(today, 1n),
          // 100 sUSG at $1.2 plus 50 reUSD at $1
          liquidity_in_token0: 100e18,
          liquidity_in_token1: 50e18,
          // 30 sUSG swapped, worth $36
          swap_token0: 30e18,
          swap_token1: 36e18,
        },
      ]),
    })

    const service = new VolumeService(repository)
    await service.computeVolumesForRange(today, today)

    expect(repository.saveDailyVolumesLp).toHaveBeenCalledWith([{ day: today, usg_lp_id: 1n, liquidity_in: 170, liquidity_out: 0, swap: 36 }])
  })

  it("skips a sUSG pool for a day with no sUSG price rather than valuing it at $1", async () => {
    const today = utcDay("2026-04-02")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const repository = buildRepository({
      getUsgLpKeys: vi.fn().mockResolvedValue([{ id: 1n, lp_name: "sUSG-reUSD", token_0: SUSG, token_0_decimals: 18, token_1: USDC, token_1_decimals: 6 }]),
      getDailyTokenPrices: vi.fn().mockResolvedValue([]),
      getDailyLpFlows: vi.fn().mockResolvedValue([{ ...emptyLpFlow(today, 1n), liquidity_in_token0: 100e18 }]),
    })

    const service = new VolumeService(repository)
    await service.computeVolumesForRange(today, today)

    expect(warn).toHaveBeenCalledOnce()
    expect(repository.saveDailyVolumesLp).not.toHaveBeenCalled()

    warn.mockRestore()
  })

  it("values sUSG mints and burns with the sUSG price of the day", async () => {
    const today = utcDay("2026-04-02")

    const repository = buildRepository({
      getDailySusgFlows: vi.fn().mockResolvedValue([{ day: today, minted: 100, burned: 40 }]),
      getDailyTokenPrices: vi.fn().mockResolvedValue([{ day: today, avg_price: 1.05 }]),
    })

    const service = new VolumeService(repository)
    await service.computeVolumesForRange(today, today)

    expect(repository.getDailySusgFlows).toHaveBeenCalledWith(SUSG, expect.any(Date), expect.any(Date))
    expect(repository.saveDailyVolumes).toHaveBeenCalledWith([{ ...emptyDailyVolume(today), susg_in: 105, susg_out: 42 }])
  })

  it("skips the LP volume and warns when a pool has no coin order recorded", async () => {
    const today = utcDay("2026-04-02")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const repository = buildRepository({
      getUsgLpKeys: vi.fn().mockResolvedValue([{ id: 1n, lp_name: "USG-USDC", token_0: "", token_0_decimals: 0, token_1: "", token_1_decimals: 0 }]),
      getDailyLpFlows: vi.fn().mockResolvedValue([{ ...emptyLpFlow(today, 1n), liquidity_in_token0: 100e18 }]),
    })

    const service = new VolumeService(repository)
    await service.computeVolumesForRange(today, today)

    expect(warn).toHaveBeenCalledOnce()
    expect(repository.saveDailyVolumesLp).not.toHaveBeenCalled()
    expect(repository.saveDailyVolumes).toHaveBeenCalledWith([emptyDailyVolume(today)])

    warn.mockRestore()
  })
})
