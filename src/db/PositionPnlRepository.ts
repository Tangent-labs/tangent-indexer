import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository.js"

/**
 * @notice  Every event of one position over one 6 hour bucket, already netted.
 *          Collateral amounts are in collateral units and USG amounts in USG, both scaled down
 *          from their 18 decimals storage. The service applies the prices.
 *
 *          `collateral_delta` is the signed change of the collateral balance, whatever the cause.
 *          The contribution / distribution columns are narrower: they only carry what the user
 *          actually put in or took out, which is what net contributions must be built from.
 */
export type BucketFlow = {
  market_id: bigint
  account: string
  bucket: Date
  collateral_delta: number
  contribution_collat: number
  distribution_collat: number
  contribution_usg: number
  distribution_usg: number
}

/**
 * @notice  Closing debt shares of one position at the end of a bucket. Raw string, since it is
 *          multiplied by the RAY debt index rather than read as a token amount.
 */
export type BucketDebtShares = {
  market_id: bigint
  account: string
  bucket: Date
  debt_shares: string
}

/**
 * @notice  USD value of the rewards one position claimed over one bucket
 */
export type BucketRewardClaim = {
  market_id: bigint
  account: string
  bucket: Date
  rewards_claimed_usd: number
}

/**
 * @notice  Closing oracle price of a market over one bucket, in USD per collateral unit
 */
export type BucketMarketPrice = {
  market_id: bigint
  bucket: Date
  price: number
}

/**
 * @notice  Closing debt index of a market over one bucket, raw RAY (1e27) string
 */
export type BucketDebtIndex = {
  market_id: bigint
  bucket: Date
  index: string
}

/**
 * @notice  Closing USD price of a token over one bucket
 */
export type BucketTokenPrice = {
  bucket: Date
  price: number
}

/**
 * @notice  The last known state of a position before the computed range, used to seed the
 *          running balances. Positions are stocks, not flows, so a range cannot be computed
 *          from its own events alone.
 */
export type PositionCarryIn = {
  market_id: bigint
  account: string
  bucket: Date
  collateral_amount: number
  debt_shares: string
  rewards_claimed_usd: number
  net_contributions_usd: number
}

/**
 * @dev  Floors a timestamp column to its 6 hour bucket. Pure timestamp arithmetic, so it stays
 *       in the column's own type and never round trips through a time zone.
 *       Kept in sync with `bucketKey` in src/utils/date.ts.
 */
const BUCKET = (col: string) => `date_trunc('day', ${col}) + floor(extract(hour from ${col}) / 6) * interval '6 hours'`

const FLOW_BUCKET = Prisma.raw(BUCKET("block_date"))
const PRICE_BUCKET = Prisma.raw(BUCKET("pf.timestamp"))
const ORACLE_BUCKET = Prisma.raw(BUCKET("timestamp"))

export class PositionPnlRepository extends AbstractRepository {
  /* =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=
                        GET
    =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-= */

  /**
   * @notice  Nets every collateral and debt movement of the range into one row per position and
   *          per bucket. One query rather than one read per event table, as for daily volumes.
   *
   * @dev     Amounts are 18 decimals uint256 stored as strings, hence the ::numeric / 1e18.
   *
   *          What counts as a user contribution is narrower than what moves the balance:
   *          - leverage buys `collat_bought` with borrowed USG that never reaches the user, so
   *            only `staked_amount - collat_bought` was actually supplied. Same for zap_leverage,
   *            where `staked_amount = collat_zap_deposit + collat_leverage`.
   *          - the USG borrowed by a leverage is spent on collateral, so it is not a distribution
   *            either, unlike a plain borrow where the user receives it.
   *          - zaps are valued on the collateral they produce (`staked_amount`), never on
   *            `amount_in` which is denominated in an arbitrary input token.
   *          - liquidate / self_liquidate / seize_collateral move collateral out and debt down
   *            without the user paying or receiving anything, so they are neither. Leaving them
   *            out of contributions is exactly what makes the loss land in PnL.
   *          - migrations net to zero across the two markets, so they are neither as well.
   */
  async getBucketFlows(from: Date, to: Date): Promise<BucketFlow[]> {
    return await this.prismaClient.$queryRaw<BucketFlow[]>`
      SELECT
        market_id,
        account,
        bucket,
        SUM(collateral_delta)::double precision    AS collateral_delta,
        SUM(contribution_collat)::double precision AS contribution_collat,
        SUM(distribution_collat)::double precision AS distribution_collat,
        SUM(contribution_usg)::double precision    AS contribution_usg,
        SUM(distribution_usg)::double precision    AS distribution_usg
      FROM (
        -- Collateral in, supplied by the user
        SELECT market_id, account, ${FLOW_BUCKET} AS bucket,
               staked_amount::numeric / 1e18 AS collateral_delta,
               staked_amount::numeric / 1e18 AS contribution_collat,
               0::numeric AS distribution_collat, 0::numeric AS contribution_usg, 0::numeric AS distribution_usg
        FROM "events"."deposit" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET},
               staked_amount::numeric / 1e18, staked_amount::numeric / 1e18, 0, 0, 0
        FROM "events"."zap_deposit" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET},
               staked_amount::numeric / 1e18, staked_amount::numeric / 1e18, 0, 0, borrow_amount::numeric / 1e18
        FROM "events"."deposit_and_borrow" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET},
               staked_amount::numeric / 1e18, staked_amount::numeric / 1e18, 0, 0, borrow_amount::numeric / 1e18
        FROM "events"."zap_deposit_and_borrow" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        -- USG handed to the user, no collateral moved
        SELECT market_id, account, ${FLOW_BUCKET},
               0, 0, 0, 0, borrowed_amount::numeric / 1e18
        FROM "events"."borrow" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        -- Leverage: only the part not bought with borrowed USG was supplied by the user
        SELECT market_id, account, ${FLOW_BUCKET},
               staked_amount::numeric / 1e18, (staked_amount::numeric - collat_bought::numeric) / 1e18, 0, 0, 0
        FROM "events"."leverage" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET},
               staked_amount::numeric / 1e18, collat_zap_deposit::numeric / 1e18, 0, 0, 0
        FROM "events"."zap_leverage" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        -- Collateral out, back to the user
        SELECT market_id, account, ${FLOW_BUCKET},
               -(withdrawn_amount::numeric / 1e18), 0, withdrawn_amount::numeric / 1e18, 0, 0
        FROM "events"."withdraw" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET},
               -(withdrawn_amount::numeric / 1e18), 0, withdrawn_amount::numeric / 1e18, repaid_amount::numeric / 1e18, 0
        FROM "events"."repay_and_withdraw" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET},
               -(withdrawn_amount::numeric / 1e18), 0, withdrawn_amount::numeric / 1e18, repaid_amount::numeric / 1e18, 0
        FROM "events"."zap_repay_and_withdraw" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        -- USG paid in by the user, no collateral moved
        SELECT market_id, account, ${FLOW_BUCKET},
               0, 0, 0, repaid_amount::numeric / 1e18, 0
        FROM "events"."repay" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET},
               0, 0, 0, repaid_amount::numeric / 1e18, 0
        FROM "events"."zap_repay" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        -- Forced exits: collateral leaves, the user neither pays nor receives
        SELECT market_id, account, ${FLOW_BUCKET},
               -(collateral_liquidated::numeric / 1e18), 0, 0, 0, 0
        FROM "events"."liquidate" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET},
               -(collateral_liquidated::numeric / 1e18), 0, 0, 0, 0
        FROM "events"."self_liquidate" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET},
               -(collateral_seized::numeric / 1e18), 0, 0, 0, 0
        FROM "events"."seize_collateral" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        -- Migrations net to zero across the two markets
        SELECT market_id, account, ${FLOW_BUCKET},
               -(collat_withdrawn::numeric / 1e18), 0, 0, 0, 0
        FROM "events"."migrate_from" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET},
               collat_added::numeric / 1e18, 0, 0, 0, 0
        FROM "events"."migrate_to" WHERE block_date >= ${from} AND block_date <= ${to}
      ) AS flows
      GROUP BY market_id, account, bucket
    `
  }

  /**
   * @notice  Closing debt shares of every position that had a debt event in the range.
   *
   * @dev     Every debt touching event records the user's resulting total debt shares, not a
   *          delta, so the last event of a bucket carries the closing balance and accrued
   *          interest never has to be summed. Tables without a debt_shares column
   *          (deposit, withdraw, zap_deposit, seize_collateral) leave debt untouched.
   *
   *          Ordering falls back on block_id then id because log_index is not indexed. Two debt
   *          events for the same position in the same block, coming from different tables, could
   *          therefore be ordered arbitrarily. In practice a position moves once per transaction.
   */
  async getBucketDebtShares(from: Date, to: Date): Promise<BucketDebtShares[]> {
    return await this.prismaClient.$queryRaw<BucketDebtShares[]>`
      SELECT DISTINCT ON (market_id, account, bucket)
        market_id, account, bucket, debt_shares
      FROM (
        SELECT market_id, account, ${FLOW_BUCKET} AS bucket, debt_shares, block_id, id
        FROM "events"."deposit_and_borrow" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET}, debt_shares, block_id, id
        FROM "events"."zap_deposit_and_borrow" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET}, debt_shares, block_id, id
        FROM "events"."borrow" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET}, debt_shares, block_id, id
        FROM "events"."leverage" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET}, debt_shares, block_id, id
        FROM "events"."zap_leverage" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET}, debt_shares, block_id, id
        FROM "events"."repay" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET}, debt_shares, block_id, id
        FROM "events"."zap_repay" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET}, debt_shares, block_id, id
        FROM "events"."repay_and_withdraw" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET}, debt_shares, block_id, id
        FROM "events"."zap_repay_and_withdraw" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET}, debt_shares, block_id, id
        FROM "events"."liquidate" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET}, debt_shares, block_id, id
        FROM "events"."self_liquidate" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET}, debt_shares, block_id, id
        FROM "events"."migrate_from" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, account, ${FLOW_BUCKET}, debt_shares, block_id, id
        FROM "events"."migrate_to" WHERE block_date >= ${from} AND block_date <= ${to}
      ) AS debts
      ORDER BY market_id, account, bucket, block_id DESC, id DESC
    `
  }

  /**
   * @notice  USD value of the rewards claimed per position and per bucket.
   * @dev     The reward token is stored as a raw address, so decimals and price are resolved
   *          here. An inner join drops claims of tokens missing from revenues_tokens or without
   *          a price that day, which is why `countUnpricedRewardClaims` exists to surface them.
   */
  async getBucketRewardClaims(from: Date, to: Date): Promise<BucketRewardClaim[]> {
    return await this.prismaClient.$queryRaw<BucketRewardClaim[]>`
      SELECT
        rp.market_id,
        rp.account,
        ${Prisma.raw(BUCKET("rp.block_date"))} AS bucket,
        SUM((rp.amount::numeric / power(10, rt.decimals)) * rtp.price)::double precision AS rewards_claimed_usd
      FROM "events"."reward_paid" rp
      JOIN "global"."revenues_tokens" rt ON lower(rt.address) = rp.reward_token
      JOIN "global"."revenues_token_prices" rtp
        ON rtp.token_id = rt.id AND rtp.day = date_trunc('day', rp.block_date)
      WHERE rp.block_date >= ${from} AND rp.block_date <= ${to}
      GROUP BY rp.market_id, rp.account, ${Prisma.raw(BUCKET("rp.block_date"))}
    `
  }

  /**
   * @notice  Reward claims the query above had to drop, so a missing token or price shows up as
   *          a warning instead of silently understating PnL
   */
  async countUnpricedRewardClaims(from: Date, to: Date) {
    const rows = await this.prismaClient.$queryRaw<{ reward_token: string; claims: bigint }[]>`
      SELECT rp.reward_token, COUNT(*) AS claims
      FROM "events"."reward_paid" rp
      LEFT JOIN "global"."revenues_tokens" rt ON lower(rt.address) = rp.reward_token
      LEFT JOIN "global"."revenues_token_prices" rtp
        ON rtp.token_id = rt.id AND rtp.day = date_trunc('day', rp.block_date)
      WHERE rp.block_date >= ${from} AND rp.block_date <= ${to} AND rtp.price IS NULL
      GROUP BY rp.reward_token
    `
    return rows.map((r) => ({ reward_token: r.reward_token, claims: Number(r.claims) }))
  }

  /**
   * @notice  Closing oracle price of every market per bucket.
   * @dev     The closing value rather than the average, because equity is a stock read at the
   *          end of the bucket. market_global_data gets a row every few seconds, so buckets are
   *          dense and DISTINCT ON is cheap enough on the timestamp index.
   */
  async getBucketOraclePrices(from: Date, to: Date): Promise<BucketMarketPrice[]> {
    const rows = await this.prismaClient.$queryRaw<{ market_id: bigint; bucket: Date; price: number }[]>`
      SELECT DISTINCT ON (market_id, bucket)
        market_id, ${ORACLE_BUCKET} AS bucket, oracle_price AS price
      FROM "global"."market_global_data"
      WHERE timestamp >= ${from} AND timestamp <= ${to}
      ORDER BY market_id, bucket, timestamp DESC
    `
    return rows.map((r) => ({ market_id: r.market_id, bucket: r.bucket, price: Number(r.price) }))
  }

  /**
   * @notice  Closing RAY debt index of every market per bucket, kept as a raw string
   */
  async getBucketDebtIndexes(from: Date, to: Date): Promise<BucketDebtIndex[]> {
    return await this.prismaClient.$queryRaw<BucketDebtIndex[]>`
      SELECT DISTINCT ON (market_id, bucket)
        market_id, ${FLOW_BUCKET} AS bucket, "newIndex" AS index
      FROM "events"."checkpoint_ir"
      WHERE block_date >= ${from} AND block_date <= ${to}
      ORDER BY market_id, bucket, block_date DESC, id DESC
    `
  }

  /**
   * @notice  Closing USD price of one token per bucket, through its points price source
   */
  async getBucketTokenPrices(tokenAddress: string, from: Date, to: Date): Promise<BucketTokenPrice[]> {
    const rows = await this.prismaClient.$queryRaw<{ bucket: Date; price: number }[]>`
      SELECT DISTINCT ON (bucket)
        ${PRICE_BUCKET} AS bucket, pf.price_usd AS price
      FROM "points"."price_feeds" pf
      JOIN "points"."price_source" ps ON ps.id = pf.price_source_id
      WHERE ps.address = ${tokenAddress.toLowerCase()}
        AND pf.timestamp >= ${from} AND pf.timestamp <= ${to}
      ORDER BY bucket, pf.timestamp DESC
    `
    return rows.map((r) => ({ bucket: r.bucket, price: Number(r.price) }))
  }

  /**
   * @notice  Last known state of every position strictly before `bucketStart`, to seed the
   *          running collateral balance, debt shares and cumulative totals
   */
  async getCarryIn(bucketStart: Date): Promise<PositionCarryIn[]> {
    return await this.prismaClient.$queryRaw<PositionCarryIn[]>`
      SELECT DISTINCT ON (market_id, account)
        market_id, account, bucket, collateral_amount, debt_shares, rewards_claimed_usd, net_contributions_usd
      FROM "global"."position_pnl"
      WHERE bucket < ${bucketStart}
      ORDER BY market_id, account, bucket DESC
    `
  }

  /**
   * @notice  Buckets already computed in the range, so a re-run only redoes the open one
   */
  async getComputedBuckets(from: Date, to: Date) {
    const rows = await this.prismaClient.$queryRaw<{ bucket: Date }[]>`
      SELECT DISTINCT bucket FROM "global"."position_pnl"
      WHERE bucket >= ${from} AND bucket <= ${to}
    `
    return rows.map((r) => r.bucket)
  }

  /* =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=
                        SAVE
    =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-= */

  /**
   * @notice  Overwrites the given buckets, since the most recent one is recomputed on every run
   *          until it closes. Inserted in chunks because a backfill writes one row per open
   *          position per bucket, which reaches far past what a single createMany can carry.
   */
  async savePositionPnl(rows: Prisma.position_pnlCreateManyInput[], chunkSize = 5_000) {
    if (!rows.length) return

    const buckets = [...new Set(rows.map((r) => (r.bucket as Date).getTime()))].map((t) => new Date(t))
    await this.prismaClient.position_pnl.deleteMany({ where: { bucket: { in: buckets } } })

    for (let i = 0; i < rows.length; i += chunkSize) {
      await this.prismaClient.position_pnl.createMany({ data: rows.slice(i, i + chunkSize) })
    }
  }
}
