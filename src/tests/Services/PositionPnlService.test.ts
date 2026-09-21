import { describe, it, expect, vi } from "vitest"
import { PositionPnlService } from "../../services/globalData/PositionPnlService.js"
import { PositionPnlRepository } from "../../db/PositionPnlRepository.js"

const USG = "0xb1c2db5d6ca03fce73dbd304d320bf76c55ae1b1"

vi.mock("../../utils/jsonReader.js", () => ({
  getAddressesJson: vi.fn().mockResolvedValue({
    tokens: { USG: "0xb1c2db5d6ca03fce73dbd304d320bf76c55ae1b1", sUSG: "0xf17d6f98a5c6eaa99d149079984119e0a4ef6900" },
  }),
}))

const MARKET = 1n
const ACCOUNT = "0xuser"
const RAY = 10n ** 27n
const WAD = 10n ** 18n

/** 6 hour bucket start, e.g. bucket("2026-09-01", 0) is 2026-09-01T00:00:00Z */
function bucket(day: string, slot: number) {
  return new Date(`${day}T00:00:00Z`.replace("T00", `T${String(slot * 6).padStart(2, "0")}`))
}

function emptyFlow(bucketDate: Date, overrides: Partial<Record<string, number>> = {}) {
  return {
    market_id: MARKET,
    account: ACCOUNT,
    bucket: bucketDate,
    collateral_delta: 0,
    contribution_collat: 0,
    distribution_collat: 0,
    contribution_usg: 0,
    distribution_usg: 0,
    ...overrides,
  }
}

function oracleAt(bucketDate: Date, price: number, marketId = MARKET) {
  return { market_id: marketId, bucket: bucketDate, price }
}

function indexAt(bucketDate: Date, index: bigint, marketId = MARKET) {
  return { market_id: marketId, bucket: bucketDate, index: index.toString() }
}

function buildRepository(overrides: Partial<Record<keyof PositionPnlRepository, any>> = {}) {
  const saved: any[] = []
  const repo = {
    getBucketFlows: vi.fn().mockResolvedValue([]),
    getBucketDebtShares: vi.fn().mockResolvedValue([]),
    getBucketRewardClaims: vi.fn().mockResolvedValue([]),
    countUnpricedRewardClaims: vi.fn().mockResolvedValue([]),
    getBucketOraclePrices: vi.fn().mockResolvedValue([]),
    getBucketDebtIndexes: vi.fn().mockResolvedValue([]),
    getBucketTokenPrices: vi.fn().mockResolvedValue([]),
    getCarryIn: vi.fn().mockResolvedValue([]),
    getComputedBuckets: vi.fn().mockResolvedValue([]),
    savePositionPnl: vi.fn().mockImplementation(async (rows: any[]) => saved.push(...rows)),
    ...overrides,
  }
  return { repo: repo as any as PositionPnlRepository, saved }
}

describe("PositionPnlService", () => {
  it("marks an idle position to market, moving PnL on the oracle price alone", async () => {
    const b0 = bucket("2026-09-01", 0)
    const b1 = bucket("2026-09-01", 1)

    // 100 collateral supplied at $2, so $200 contributed and no debt
    const { repo, saved } = buildRepository({
      getCarryIn: vi.fn().mockResolvedValue([
        {
          market_id: MARKET,
          account: ACCOUNT,
          bucket: bucket("2026-08-31", 3),
          collateral_amount: 100,
          debt_shares: "0",
          rewards_claimed_usd: 0,
          net_contributions_usd: 200,
        },
      ]),
      getBucketOraclePrices: vi.fn().mockResolvedValue([oracleAt(b0, 2), oracleAt(b1, 2.5)]),
    })

    await new PositionPnlService(repo).computePnlForRange(b0, b1)

    expect(saved).toHaveLength(2)
    // Flat price: equity 200, contributions 200, no profit
    expect(saved[0].equity_usd).toBeCloseTo(200)
    expect(saved[0].pnl_usd).toBeCloseTo(0)
    // Price up 25%: equity 250 against the same 200 contributed
    expect(saved[1].equity_usd).toBeCloseTo(250)
    expect(saved[1].pnl_usd).toBeCloseTo(50)
  })

  it("leaves PnL at zero when a position is opened at unchanged prices", async () => {
    const b0 = bucket("2026-09-01", 0)

    // Deposit 100 collateral at $2 and borrow 50 USG at $1
    const { repo, saved } = buildRepository({
      getBucketFlows: vi.fn().mockResolvedValue([emptyFlow(b0, { collateral_delta: 100, contribution_collat: 100, distribution_usg: 50 })]),
      getBucketDebtShares: vi.fn().mockResolvedValue([{ market_id: MARKET, account: ACCOUNT, bucket: b0, debt_shares: (50n * WAD).toString() }]),
      getBucketOraclePrices: vi.fn().mockResolvedValue([oracleAt(b0, 2)]),
      getBucketDebtIndexes: vi.fn().mockResolvedValue([indexAt(b0, RAY)]),
      getBucketTokenPrices: vi.fn().mockResolvedValue([{ bucket: b0, price: 1 }]),
    })

    await new PositionPnlService(repo).computePnlForRange(b0, b0)

    expect(saved).toHaveLength(1)
    // equity = 100 * 2 - 50 = 150, contributions = 200 in - 50 out = 150
    expect(saved[0].equity_usd).toBeCloseTo(150)
    expect(saved[0].net_contributions_usd).toBeCloseTo(150)
    expect(saved[0].pnl_usd).toBeCloseTo(0)
  })

  it("counts only the collateral the user supplied on a leverage, not the part bought with debt", async () => {
    const b0 = bucket("2026-09-01", 0)

    // 100 collateral added, 60 of it bought with borrowed USG, so only 40 was supplied
    const { repo, saved } = buildRepository({
      getBucketFlows: vi.fn().mockResolvedValue([emptyFlow(b0, { collateral_delta: 100, contribution_collat: 40 })]),
      getBucketDebtShares: vi.fn().mockResolvedValue([{ market_id: MARKET, account: ACCOUNT, bucket: b0, debt_shares: (120n * WAD).toString() }]),
      getBucketOraclePrices: vi.fn().mockResolvedValue([oracleAt(b0, 2)]),
      getBucketDebtIndexes: vi.fn().mockResolvedValue([indexAt(b0, RAY)]),
      getBucketTokenPrices: vi.fn().mockResolvedValue([{ bucket: b0, price: 1 }]),
    })

    await new PositionPnlService(repo).computePnlForRange(b0, b0)

    // equity = 100 * 2 - 120 = 80, contributions = 40 * 2 = 80
    expect(saved[0].net_contributions_usd).toBeCloseTo(80)
    expect(saved[0].equity_usd).toBeCloseTo(80)
    expect(saved[0].pnl_usd).toBeCloseTo(0)
  })

  it("books a liquidation as a loss without touching net contributions", async () => {
    const b0 = bucket("2026-09-01", 0)
    const b1 = bucket("2026-09-01", 1)

    // Open with 100 collateral at $2 and 100 USG of debt, then get liquidated for 60 collateral
    // while 100 of debt is repaid by the liquidator
    const { repo, saved } = buildRepository({
      getCarryIn: vi.fn().mockResolvedValue([
        {
          market_id: MARKET,
          account: ACCOUNT,
          bucket: bucket("2026-08-31", 3),
          collateral_amount: 100,
          debt_shares: (100n * WAD).toString(),
          rewards_claimed_usd: 0,
          net_contributions_usd: 100,
        },
      ]),
      getBucketFlows: vi.fn().mockResolvedValue([emptyFlow(b1, { collateral_delta: -60 })]),
      getBucketDebtShares: vi.fn().mockResolvedValue([{ market_id: MARKET, account: ACCOUNT, bucket: b1, debt_shares: "0" }]),
      getBucketOraclePrices: vi.fn().mockResolvedValue([oracleAt(b0, 2), oracleAt(b1, 2)]),
      getBucketDebtIndexes: vi.fn().mockResolvedValue([indexAt(b0, RAY), indexAt(b1, RAY)]),
      getBucketTokenPrices: vi.fn().mockResolvedValue([
        { bucket: b0, price: 1 },
        { bucket: b1, price: 1 },
      ]),
    })

    await new PositionPnlService(repo).computePnlForRange(b0, b1)

    // Before: equity = 200 - 100 = 100 against 100 contributed, so flat
    expect(saved[0].pnl_usd).toBeCloseTo(0)
    // After: 40 collateral left at $2, no debt. Contributions unchanged, so the $20 penalty is
    // the whole of the loss
    expect(saved[1].net_contributions_usd).toBeCloseTo(100)
    expect(saved[1].equity_usd).toBeCloseTo(80)
    expect(saved[1].pnl_usd).toBeCloseTo(-20)
  })

  it("raises PnL by a reward claim, which never enters equity", async () => {
    const b0 = bucket("2026-09-01", 0)

    const { repo, saved } = buildRepository({
      getCarryIn: vi.fn().mockResolvedValue([
        {
          market_id: MARKET,
          account: ACCOUNT,
          bucket: bucket("2026-08-31", 3),
          collateral_amount: 100,
          debt_shares: "0",
          rewards_claimed_usd: 0,
          net_contributions_usd: 200,
        },
      ]),
      getBucketRewardClaims: vi.fn().mockResolvedValue([{ market_id: MARKET, account: ACCOUNT, bucket: b0, rewards_claimed_usd: 15 }]),
      getBucketOraclePrices: vi.fn().mockResolvedValue([oracleAt(b0, 2)]),
    })

    await new PositionPnlService(repo).computePnlForRange(b0, b0)

    // Equity is untouched at 200, but 15 was taken out of the position, so PnL is +15
    expect(saved[0].equity_usd).toBeCloseTo(200)
    expect(saved[0].rewards_claimed_usd).toBeCloseTo(15)
    expect(saved[0].net_contributions_usd).toBeCloseTo(185)
    expect(saved[0].pnl_usd).toBeCloseTo(15)
  })

  it("grows the debt from the index alone, with no debt event in between", async () => {
    const b0 = bucket("2026-09-01", 0)
    const b1 = bucket("2026-09-01", 1)

    const { repo, saved } = buildRepository({
      getCarryIn: vi.fn().mockResolvedValue([
        {
          market_id: MARKET,
          account: ACCOUNT,
          bucket: bucket("2026-08-31", 3),
          collateral_amount: 100,
          debt_shares: (100n * WAD).toString(),
          rewards_claimed_usd: 0,
          net_contributions_usd: 100,
        },
      ]),
      getBucketOraclePrices: vi.fn().mockResolvedValue([oracleAt(b0, 2), oracleAt(b1, 2)]),
      // Index moves from 1.0 to 1.1: the same shares now owe 110
      getBucketDebtIndexes: vi.fn().mockResolvedValue([indexAt(b0, RAY), indexAt(b1, (RAY * 11n) / 10n)]),
      getBucketTokenPrices: vi.fn().mockResolvedValue([
        { bucket: b0, price: 1 },
        { bucket: b1, price: 1 },
      ]),
    })

    await new PositionPnlService(repo).computePnlForRange(b0, b1)

    expect(saved[0].debt_usd).toBeCloseTo(100)
    expect(saved[1].debt_usd).toBeCloseTo(110)
    // Interest is a real loss: same collateral, more debt owed
    expect(saved[1].pnl_usd).toBeCloseTo(-10)
  })

  it("stops writing rows once a position is fully closed", async () => {
    const b0 = bucket("2026-09-01", 0)
    const b1 = bucket("2026-09-01", 1)
    const b2 = bucket("2026-09-01", 2)

    const { repo, saved } = buildRepository({
      getCarryIn: vi.fn().mockResolvedValue([
        {
          market_id: MARKET,
          account: ACCOUNT,
          bucket: bucket("2026-08-31", 3),
          collateral_amount: 100,
          debt_shares: "0",
          rewards_claimed_usd: 0,
          net_contributions_usd: 200,
        },
      ]),
      // Everything withdrawn during the second bucket
      getBucketFlows: vi.fn().mockResolvedValue([emptyFlow(b1, { collateral_delta: -100, distribution_collat: 100 })]),
      getBucketOraclePrices: vi.fn().mockResolvedValue([oracleAt(b0, 2), oracleAt(b1, 2), oracleAt(b2, 2)]),
    })

    await new PositionPnlService(repo).computePnlForRange(b0, b2)

    // The closing bucket still gets its row, the one after it does not
    expect(saved).toHaveLength(2)
    expect(saved[1].bucket).toEqual(b1)
    expect(saved[1].equity_usd).toBeCloseTo(0)
    // Took out exactly what was put in
    expect(saved[1].pnl_usd).toBeCloseTo(0)
  })

  it("recomputes only the open bucket when earlier ones are already stored", async () => {
    const b0 = bucket("2026-09-01", 0)
    const b1 = bucket("2026-09-01", 1)

    const { repo, saved } = buildRepository({
      getCarryIn: vi.fn().mockResolvedValue([
        {
          market_id: MARKET,
          account: ACCOUNT,
          bucket: bucket("2026-08-31", 3),
          collateral_amount: 100,
          debt_shares: "0",
          rewards_claimed_usd: 0,
          net_contributions_usd: 200,
        },
      ]),
      getComputedBuckets: vi.fn().mockResolvedValue([b0]),
      getBucketOraclePrices: vi.fn().mockResolvedValue([oracleAt(b0, 2), oracleAt(b1, 3)]),
    })

    await new PositionPnlService(repo).computePnlForRange(b0, b1)

    expect(saved).toHaveLength(1)
    expect(saved[0].bucket).toEqual(b1)
    expect(saved[0].pnl_usd).toBeCloseTo(100)
  })

  it("values a bucket with no price of its own from the last known one", async () => {
    const b0 = bucket("2026-09-01", 0)
    const b1 = bucket("2026-09-01", 1)

    const { repo, saved } = buildRepository({
      getCarryIn: vi.fn().mockResolvedValue([
        {
          market_id: MARKET,
          account: ACCOUNT,
          bucket: bucket("2026-08-31", 3),
          collateral_amount: 100,
          debt_shares: "0",
          rewards_claimed_usd: 0,
          net_contributions_usd: 200,
        },
      ]),
      // Only a point in the lookback window, nothing inside the range
      getBucketOraclePrices: vi.fn().mockResolvedValue([oracleAt(bucket("2026-08-31", 2), 2)]),
    })

    await new PositionPnlService(repo).computePnlForRange(b0, b1)

    expect(saved).toHaveLength(2)
    expect(saved[0].collateral_usd).toBeCloseTo(200)
    expect(saved[1].collateral_usd).toBeCloseTo(200)
  })

  it("skips a position whose market has no price at all rather than writing a wrong row", async () => {
    const b0 = bucket("2026-09-01", 0)

    const { repo, saved } = buildRepository({
      getCarryIn: vi.fn().mockResolvedValue([
        {
          market_id: MARKET,
          account: ACCOUNT,
          bucket: bucket("2026-08-31", 3),
          collateral_amount: 100,
          debt_shares: "0",
          rewards_claimed_usd: 0,
          net_contributions_usd: 200,
        },
      ]),
    })

    await new PositionPnlService(repo).computePnlForRange(b0, b0)

    expect(saved).toHaveLength(0)
  })

  it("reads the USG price from its feed rather than assuming the peg holds", async () => {
    const b0 = bucket("2026-09-01", 0)

    const { repo, saved } = buildRepository({
      getCarryIn: vi.fn().mockResolvedValue([
        {
          market_id: MARKET,
          account: ACCOUNT,
          bucket: bucket("2026-08-31", 3),
          collateral_amount: 100,
          debt_shares: (100n * WAD).toString(),
          rewards_claimed_usd: 0,
          net_contributions_usd: 100,
        },
      ]),
      getBucketOraclePrices: vi.fn().mockResolvedValue([oracleAt(b0, 2)]),
      getBucketDebtIndexes: vi.fn().mockResolvedValue([indexAt(b0, RAY)]),
      getBucketTokenPrices: vi.fn().mockResolvedValue([{ bucket: b0, price: 0.98 }]),
    })

    const service = new PositionPnlService(repo)
    await service.computePnlForRange(b0, b0)

    expect(repo.getBucketTokenPrices).toHaveBeenCalledWith(USG, expect.any(Date), expect.any(Date))
    // Debt is worth 98, not 100, so the depeg is a gain for the borrower
    expect(saved[0].debt_usd).toBeCloseTo(98)
    expect(saved[0].equity_usd).toBeCloseTo(102)
  })
})
