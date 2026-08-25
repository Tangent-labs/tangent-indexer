import { Prisma } from "@prisma/client"
import { ZeroAddress } from "ethers"
import { AbstractRepository } from "./AbstractRepository.js"

const ZERO_ADDRESS = ZeroAddress.toLowerCase()

/**
 * @notice  Average oracle price of a market over one UTC day, used to value collateral volume
 */
export type DailyCollateralPrice = {
  market_id: bigint
  day: Date
  avg_price: number
}

/**
 * @notice  Raw per pool and per UTC day LP amounts. Amounts stay unscaled because the decimals
 *          depend on which coin sits at index 0 and 1 of the pool, which usg_lp_keys records.
 */
export type DailyLpFlow = {
  usg_lp_id: bigint
  day: Date
  liquidity_in_token0: number
  liquidity_in_token1: number
  liquidity_out_token0: number
  liquidity_out_token1: number
  swap_token0: number
  swap_token1: number
}

/**
 * @notice  sUSG minted and burned over one UTC day, already scaled from its 18 decimals
 */
export type DailySusgFlow = {
  day: Date
  minted: number
  burned: number
}

/**
 * @notice  Average USD price of a token over one UTC day, from the points price feeds
 */
export type DailyTokenPrice = {
  day: Date
  avg_price: number
}

/**
 * @notice  Collateral and debt flows of one market over one UTC day.
 *          Collateral is in collateral units (the oracle price is applied by the service),
 *          debt is in USG. Both are already scaled down from their 18 decimals storage.
 */
export type DailyMarketFlow = {
  market_id: bigint
  day: Date
  collateral_in: number
  collateral_out: number
  debt_in: number
  debt_out: number
}

export class VolumeRepository extends AbstractRepository {
  /* =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=
                        GET
    =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-= */

  /**
   * @notice  Averages market_global_data.oracle_price per market and per UTC day.
   *          Raw SQL because Prisma cannot group by date_trunc.
   */
  async getDailyCollateralPrices(from: Date, to: Date): Promise<DailyCollateralPrice[]> {
    const rows = await this.prismaClient.$queryRaw<{ market_id: bigint; day: Date; avg_price: number }[]>`
      SELECT market_id, date_trunc('day', timestamp) AS day, AVG(oracle_price) AS avg_price
      FROM "global"."market_global_data"
      WHERE timestamp >= ${from} AND timestamp <= ${to}
      GROUP BY market_id, date_trunc('day', timestamp)
    `

    return rows.map((r) => ({ market_id: r.market_id, day: r.day, avg_price: Number(r.avg_price) }))
  }

  /**
   * @notice  Aggregates every market event of the range into one row per market and per UTC day.
   *          Done in a single query rather than one read per event table.
   * @dev     Amounts are 18 decimals uint256 stored as strings, hence the ::numeric / 1e18.
   *          Zaps are valued on the collateral they produce (staked_amount / withdrawn_amount),
   *          never on amount_in which is denominated in an arbitrary input token.
   *          leverage / zap_leverage staked_amount is the total collateral added, it already
   *          includes collat_bought and collat_zap_deposit + collat_leverage.
   *          seize_collateral is excluded on purpose: it is a protocol bad debt seizure,
   *          not user volume.
   */
  async getDailyMarketFlows(from: Date, to: Date): Promise<DailyMarketFlow[]> {
    return await this.prismaClient.$queryRaw<DailyMarketFlow[]>`
      SELECT
        market_id,
        day,
        SUM(collateral_in)::double precision AS collateral_in,
        SUM(collateral_out)::double precision AS collateral_out,
        SUM(debt_in)::double precision AS debt_in,
        SUM(debt_out)::double precision AS debt_out
      FROM (
        -- Collateral IN, with the debt opened by the combined entrypoints
        SELECT market_id, date_trunc('day', block_date) AS day,
               staked_amount::numeric / 1e18 AS collateral_in, 0::numeric AS collateral_out, 0::numeric AS debt_in, 0::numeric AS debt_out
        FROM "events"."deposit" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, date_trunc('day', block_date),
               staked_amount::numeric / 1e18, 0, 0, 0
        FROM "events"."zap_deposit" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, date_trunc('day', block_date),
               staked_amount::numeric / 1e18, 0, borrow_amount::numeric / 1e18, 0
        FROM "events"."deposit_and_borrow" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, date_trunc('day', block_date),
               staked_amount::numeric / 1e18, 0, borrow_amount::numeric / 1e18, 0
        FROM "events"."zap_deposit_and_borrow" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, date_trunc('day', block_date),
               staked_amount::numeric / 1e18, 0, borrowed_amount::numeric / 1e18, 0
        FROM "events"."leverage" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, date_trunc('day', block_date),
               staked_amount::numeric / 1e18, 0, borrowed_amount::numeric / 1e18, 0
        FROM "events"."zap_leverage" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, date_trunc('day', block_date),
               0, 0, borrowed_amount::numeric / 1e18, 0
        FROM "events"."borrow" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        -- Collateral OUT, with the debt repaid
        SELECT market_id, date_trunc('day', block_date),
               0, withdrawn_amount::numeric / 1e18, 0, 0
        FROM "events"."withdraw" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, date_trunc('day', block_date),
               0, withdrawn_amount::numeric / 1e18, 0, repaid_amount::numeric / 1e18
        FROM "events"."repay_and_withdraw" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, date_trunc('day', block_date),
               0, withdrawn_amount::numeric / 1e18, 0, repaid_amount::numeric / 1e18
        FROM "events"."zap_repay_and_withdraw" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, date_trunc('day', block_date),
               0, collateral_liquidated::numeric / 1e18, 0, repaid_amount::numeric / 1e18
        FROM "events"."liquidate" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, date_trunc('day', block_date),
               0, collateral_liquidated::numeric / 1e18, 0, repaid_amount::numeric / 1e18
        FROM "events"."self_liquidate" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, date_trunc('day', block_date),
               0, 0, 0, repaid_amount::numeric / 1e18
        FROM "events"."repay" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT market_id, date_trunc('day', block_date),
               0, 0, 0, repaid_amount::numeric / 1e18
        FROM "events"."zap_repay" WHERE block_date >= ${from} AND block_date <= ${to}
      ) AS flows
      GROUP BY market_id, day
    `
  }

  /**
   * @notice  Aggregates the LP events of the range into one row per pool and per UTC day.
   * @dev     A swap always has USG on exactly one leg, so summing the amount sold and the amount
   *          bought per coin index and keeping only the USG index counts each swap notional once.
   */
  async getDailyLpFlows(from: Date, to: Date): Promise<DailyLpFlow[]> {
    return await this.prismaClient.$queryRaw<DailyLpFlow[]>`
      SELECT
        usg_lp_id,
        day,
        SUM(liquidity_in_token0)::double precision AS liquidity_in_token0,
        SUM(liquidity_in_token1)::double precision AS liquidity_in_token1,
        SUM(liquidity_out_token0)::double precision AS liquidity_out_token0,
        SUM(liquidity_out_token1)::double precision AS liquidity_out_token1,
        SUM(swap_token0)::double precision AS swap_token0,
        SUM(swap_token1)::double precision AS swap_token1
      FROM (
        SELECT usg_lp_id, date_trunc('day', block_date) AS day,
               token0_amount::numeric AS liquidity_in_token0, token1_amount::numeric AS liquidity_in_token1,
               0::numeric AS liquidity_out_token0, 0::numeric AS liquidity_out_token1,
               0::numeric AS swap_token0, 0::numeric AS swap_token1
        FROM "predeposit"."add_liquidity_events" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT usg_lp_id, date_trunc('day', block_date),
               0, 0,
               token0_amount::numeric, token1_amount::numeric,
               0, 0
        FROM "events"."remove_liquidity" WHERE block_date >= ${from} AND block_date <= ${to}
        UNION ALL
        SELECT usg_lp_id, date_trunc('day', block_date),
               0, 0, 0, 0,
               CASE WHEN sold_id = 0 THEN tokens_sold::numeric ELSE 0 END
                 + CASE WHEN bought_id = 0 THEN tokens_bought::numeric ELSE 0 END,
               CASE WHEN sold_id = 1 THEN tokens_sold::numeric ELSE 0 END
                 + CASE WHEN bought_id = 1 THEN tokens_bought::numeric ELSE 0 END
        FROM "events"."token_exchange" WHERE block_date >= ${from} AND block_date <= ${to}
      ) AS lp_flows
      GROUP BY usg_lp_id, day
    `
  }

  /**
   * @notice  sUSG minted and burned per UTC day, a mint being a transfer from the zero address
   *          and a burn a transfer to it. sUSG is 18 decimals.
   */
  async getDailySusgFlows(susgAddress: string, from: Date, to: Date): Promise<DailySusgFlow[]> {
    return await this.prismaClient.$queryRaw<DailySusgFlow[]>`
      SELECT
        date_trunc('day', block_date) AS day,
        SUM(CASE WHEN "from" = ${ZERO_ADDRESS} THEN amount::numeric ELSE 0 END)::double precision / 1e18 AS minted,
        SUM(CASE WHEN "to" = ${ZERO_ADDRESS} THEN amount::numeric ELSE 0 END)::double precision / 1e18 AS burned
      FROM "events"."transfer_events"
      WHERE token_address = ${susgAddress.toLowerCase()}
        AND block_date >= ${from} AND block_date <= ${to}
        AND ("from" = ${ZERO_ADDRESS} OR "to" = ${ZERO_ADDRESS})
      GROUP BY date_trunc('day', block_date)
    `
  }

  /**
   * @notice  Average USD price per UTC day of one token, resolved through its points price source
   */
  async getDailyTokenPrices(tokenAddress: string, from: Date, to: Date): Promise<DailyTokenPrice[]> {
    const rows = await this.prismaClient.$queryRaw<{ day: Date; avg_price: number }[]>`
      SELECT date_trunc('day', pf.timestamp) AS day, AVG(pf.price_usd)::double precision AS avg_price
      FROM "points"."price_feeds" pf
      JOIN "points"."price_source" ps ON ps.id = pf.price_source_id
      WHERE ps.address = ${tokenAddress.toLowerCase()}
        AND pf.timestamp >= ${from} AND pf.timestamp <= ${to}
      GROUP BY date_trunc('day', pf.timestamp)
    `

    return rows.map((r) => ({ day: r.day, avg_price: Number(r.avg_price) }))
  }

  /**
   * @notice  Pool coin order and decimals, persisted at seed time. Read from the database rather
   *          than the chain, both being fixed at pool creation.
   */
  async getUsgLpKeys() {
    return await this.prismaClient.usg_lp_keys.findMany({
      select: { id: true, lp_name: true, token_0: true, token_0_decimals: true, token_1: true, token_1_decimals: true },
    })
  }

  async getDailyVolumes(from: Date, to: Date) {
    return await this.prismaClient.daily_volumes.findMany({
      where: {
        day: {
          gte: from,
          lte: to,
        },
      },
    })
  }

  async getDailyVolumesLp(from: Date, to: Date) {
    return await this.prismaClient.daily_volumes_lp.findMany({
      where: {
        day: {
          gte: from,
          lte: to,
        },
      },
    })
  }

  async getDailyVolumesMarket(from: Date, to: Date) {
    return await this.prismaClient.daily_volumes_market.findMany({
      where: {
        day: {
          gte: from,
          lte: to,
        },
      },
    })
  }

  /* =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=
                        SAVE
    =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-= */

  /**
   * @notice  Overwrites daily_volumes rows for the given days, since the table has no unique
   *          constraint on `day` and D0 gets recomputed on every run until the day is closed
   */
  async saveDailyVolumes(dailyVolumes: Prisma.daily_volumesCreateManyInput[]) {
    const days = dailyVolumes.map((v) => v.day as Date)
    await this.prismaClient.daily_volumes.deleteMany({
      where: {
        day: {
          in: days,
        },
      },
    })
    await this.prismaClient.daily_volumes.createMany({
      data: dailyVolumes,
    })
  }

  /**
   * @notice  Overwrites daily_volumes_lp rows for the given days, same reasoning as saveDailyVolumes
   */
  async saveDailyVolumesLp(dailyVolumesLp: Prisma.daily_volumes_lpCreateManyInput[]) {
    const days = dailyVolumesLp.map((v) => v.day as Date)
    await this.prismaClient.daily_volumes_lp.deleteMany({
      where: {
        day: {
          in: days,
        },
      },
    })
    await this.prismaClient.daily_volumes_lp.createMany({
      data: dailyVolumesLp,
    })
  }

  /**
   * @notice  Overwrites daily_volumes_market rows for the given days, same reasoning as saveDailyVolumes
   */
  async saveDailyVolumesMarket(dailyVolumesMarket: Prisma.daily_volumes_marketCreateManyInput[]) {
    const days = dailyVolumesMarket.map((v) => v.day as Date)
    await this.prismaClient.daily_volumes_market.deleteMany({
      where: {
        day: {
          in: days,
        },
      },
    })
    await this.prismaClient.daily_volumes_market.createMany({
      data: dailyVolumesMarket,
    })
  }
}
