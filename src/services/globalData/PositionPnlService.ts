import { Prisma } from "@prisma/client"

import { PositionPnlRepository } from "../../db/PositionPnlRepository.js"
import { BUCKET_MS, DAY_MS, bucketKey } from "../../utils/date.js"
import { bigIntToNumber } from "../../utils/formatting.js"
import { getAddressesJson } from "../../utils/jsonReader.js"

const RAY = 10n ** 27n

/**
 * @notice  How far before the range to look for a price, so a bucket with no point of its own
 *          can still be valued from the last known one. market_global_data and price_feeds are
 *          written every few seconds, so two days is already a wide margin.
 */
const PRICE_LOOKBACK_MS = 2 * DAY_MS

/**
 * @notice  Same idea for the debt index, with a much wider window: CheckpointIR is only emitted
 *          when the bot updates the interest rate, and events.checkpoint_ir is a small table.
 */
const INDEX_LOOKBACK_MS = 30 * DAY_MS

/** Collateral below this is dust from float accumulation, not an open position */
const DUST = 1e-12

type PositionState = {
  market_id: bigint
  account: string
  collateral_amount: number
  debt_shares: bigint
  rewards_claimed_usd: number
  net_contributions_usd: number
}

const positionId = (marketId: bigint, account: string) => `${marketId}-${account}`

export class PositionPnlService {
  positionPnlRepository: PositionPnlRepository

  constructor(positionPnlRepository: PositionPnlRepository) {
    this.positionPnlRepository = positionPnlRepository
  }

  /**
   * @notice  Computes the equity and PnL of every lending position over the 6 hour buckets
   *          between `from` and `to`, both included.
   *
   *          equity_usd            = collateral_amount * oracle_price - debt_usd
   *          net_contributions_usd = cumulative(contributions - distributions), each flow valued
   *                                  when it happened
   *          pnl_usd               = equity_usd - net_contributions_usd
   *
   *          Subtracting net contributions is what separates profit from a bigger deposit: a user
   *          who doubles their collateral doubles their equity without earning anything.
   *
   *          Buckets already stored are skipped, except the most recent one of the range, which is
   *          recomputed on every run until it closes.
   *
   * @dev     ponytail: flows are valued at the closing price of their bucket rather than at their
   *          own block price. Move to per block pricing if the drift within 6 hours ever shows up.
   */
  async computePnlForRange(from: Date, to: Date) {
    const rangeStart = new Date(bucketKey(from))
    const lastBucketKey = bucketKey(to)
    const rangeEnd = new Date(lastBucketKey + BUCKET_MS - 1)

    if (lastBucketKey < rangeStart.getTime()) return []

    const {
      tokens: { USG },
    } = await getAddressesJson()

    const priceFrom = new Date(rangeStart.getTime() - PRICE_LOOKBACK_MS)
    const indexFrom = new Date(rangeStart.getTime() - INDEX_LOOKBACK_MS)

    const [flows, debtShares, rewardClaims, unpricedClaims, oraclePrices, debtIndexes, usgPrices, carryIn, computedBuckets] = await Promise.all([
      this.positionPnlRepository.getBucketFlows(rangeStart, rangeEnd),
      this.positionPnlRepository.getBucketDebtShares(rangeStart, rangeEnd),
      this.positionPnlRepository.getBucketRewardClaims(rangeStart, rangeEnd),
      this.positionPnlRepository.countUnpricedRewardClaims(rangeStart, rangeEnd),
      this.positionPnlRepository.getBucketOraclePrices(priceFrom, rangeEnd),
      this.positionPnlRepository.getBucketDebtIndexes(indexFrom, rangeEnd),
      this.positionPnlRepository.getBucketTokenPrices(USG, priceFrom, rangeEnd),
      this.positionPnlRepository.getCarryIn(rangeStart),
      this.positionPnlRepository.getComputedBuckets(rangeStart, rangeEnd),
    ])

    unpricedClaims.forEach((c) => console.warn(`Position PnL: ${c.claims} reward claim(s) of ${c.reward_token} dropped, no token price for that day`))

    const flowsPerBucket = groupByBucket(flows)
    const debtSharesPerBucket = groupByBucket(debtShares)
    const rewardClaimsPerBucket = groupByBucket(rewardClaims)
    const oraclePerBucket = groupByBucket(oraclePrices)
    const indexPerBucket = groupByBucket(debtIndexes)
    const usgPerBucket = new Map(usgPrices.map((p) => [bucketKey(p.bucket), p.price]))

    const computedBucketKeys = new Set(computedBuckets.map((b) => bucketKey(b)))

    // Running state, seeded with the last known state of every position before the range
    const positions = new Map<string, PositionState>(
      carryIn.map((c) => [
        positionId(c.market_id, c.account),
        {
          market_id: c.market_id,
          account: c.account,
          collateral_amount: c.collateral_amount,
          debt_shares: BigInt(c.debt_shares),
          rewards_claimed_usd: c.rewards_claimed_usd,
          net_contributions_usd: c.net_contributions_usd,
        },
      ])
    )

    // Last known price and index per market, forward filled as the buckets are walked. Seeded
    // from the lookback window so the first bucket of the range is already valued.
    const lastOracle = new Map<string, number>()
    const lastIndex = new Map<string, bigint>()
    let lastUsgPrice = 1

    seedBeforeRange(oraclePrices, rangeStart, (p) => lastOracle.set(p.market_id.toString(), p.price))
    seedBeforeRange(debtIndexes, rangeStart, (p) => lastIndex.set(p.market_id.toString(), BigInt(p.index)))
    seedBeforeRange(usgPrices, rangeStart, (p) => (lastUsgPrice = p.price))

    const rows: Prisma.position_pnlCreateManyInput[] = []
    const unvaluedMarkets = new Set<string>()

    for (let key = rangeStart.getTime(); key <= lastBucketKey; key += BUCKET_MS) {
      // Prices first: they apply to this bucket's flows as well as to its closing marks
      oraclePerBucket.get(key)?.forEach((p) => lastOracle.set(p.market_id.toString(), p.price))
      indexPerBucket.get(key)?.forEach((p) => lastIndex.set(p.market_id.toString(), BigInt(p.index)))
      const usgAtBucket = usgPerBucket.get(key)
      if (usgAtBucket !== undefined) lastUsgPrice = usgAtBucket

      const bucketFlows = flowsPerBucket.get(key) ?? []
      const bucketDebt = debtSharesPerBucket.get(key) ?? []
      const bucketRewards = rewardClaimsPerBucket.get(key) ?? []

      const touched = new Set<string>()

      bucketFlows.forEach((flow) => {
        const state = upsertPosition(positions, flow.market_id, flow.account)
        touched.add(positionId(flow.market_id, flow.account))

        const collateralPrice = lastOracle.get(flow.market_id.toString())
        if (collateralPrice === undefined) {
          unvaluedMarkets.add(flow.market_id.toString())
          return
        }

        state.collateral_amount += flow.collateral_delta
        state.net_contributions_usd +=
          flow.contribution_collat * collateralPrice +
          flow.contribution_usg * lastUsgPrice -
          (flow.distribution_collat * collateralPrice + flow.distribution_usg * lastUsgPrice)
      })

      bucketDebt.forEach((debt) => {
        const state = upsertPosition(positions, debt.market_id, debt.account)
        touched.add(positionId(debt.market_id, debt.account))
        state.debt_shares = BigInt(debt.debt_shares)
      })

      // A claim is value leaving the position. It is a distribution, not a contribution, which is
      // exactly what makes reward income show up as profit without ever entering equity.
      bucketRewards.forEach((claim) => {
        const state = upsertPosition(positions, claim.market_id, claim.account)
        touched.add(positionId(claim.market_id, claim.account))
        state.rewards_claimed_usd += claim.rewards_claimed_usd
        state.net_contributions_usd -= claim.rewards_claimed_usd
      })

      if (computedBucketKeys.has(key) && key !== lastBucketKey) continue

      const bucket = new Date(key)
      positions.forEach((state, id) => {
        const isOpen = state.collateral_amount > DUST || state.debt_shares > 0n
        if (!isOpen && !touched.has(id)) return

        const collateralPrice = lastOracle.get(state.market_id.toString())
        const debtIndex = lastIndex.get(state.market_id.toString())
        if (collateralPrice === undefined || (state.debt_shares > 0n && debtIndex === undefined)) {
          unvaluedMarkets.add(state.market_id.toString())
          return
        }

        // debt_shares is the user's resulting total, so the RAY index turns it into the debt
        // owed today, accrued interest included, with no cumulative sum to drift
        const debtAmount = state.debt_shares > 0n ? bigIntToNumber((state.debt_shares * debtIndex!) / RAY, 18) : 0
        const debtUsd = debtAmount * lastUsgPrice
        const collateralUsd = state.collateral_amount * collateralPrice
        const equityUsd = collateralUsd - debtUsd

        rows.push({
          market_id: state.market_id,
          account: state.account,
          bucket,
          collateral_amount: state.collateral_amount,
          collateral_usd: collateralUsd,
          debt_shares: state.debt_shares.toString(),
          debt_usd: debtUsd,
          rewards_claimed_usd: state.rewards_claimed_usd,
          equity_usd: equityUsd,
          net_contributions_usd: state.net_contributions_usd,
          pnl_usd: equityUsd - state.net_contributions_usd,
        })
      })
    }

    if (unvaluedMarkets.size) {
      console.warn(`Position PnL: no oracle price or debt index for market(s) ${[...unvaluedMarkets].join(", ")}, positions skipped`)
    }

    await this.positionPnlRepository.savePositionPnl(rows)

    return rows
  }
}

function upsertPosition(positions: Map<string, PositionState>, marketId: bigint, account: string): PositionState {
  const id = positionId(marketId, account)
  const existing = positions.get(id)
  if (existing) return existing

  const created: PositionState = {
    market_id: marketId,
    account,
    collateral_amount: 0,
    debt_shares: 0n,
    rewards_claimed_usd: 0,
    net_contributions_usd: 0,
  }
  positions.set(id, created)
  return created
}

function groupByBucket<T extends { bucket: Date }>(rows: T[]) {
  const perBucket = new Map<number, T[]>()
  rows.forEach((row) => {
    const key = bucketKey(row.bucket)
    const existing = perBucket.get(key)
    if (existing) {
      existing.push(row)
    } else {
      perBucket.set(key, [row])
    }
  })
  return perBucket
}

/**
 * @notice  Replays the points of the lookback window, oldest first, so the forward filled price
 *          and index maps already hold a value when the first bucket of the range is reached
 */
function seedBeforeRange<T extends { bucket: Date }>(rows: T[], rangeStart: Date, apply: (row: T) => void) {
  rows
    .filter((row) => bucketKey(row.bucket) < rangeStart.getTime())
    .sort((a, b) => bucketKey(a.bucket) - bucketKey(b.bucket))
    .forEach(apply)
}
