import { PriceSourceType, Prisma } from "@prisma/client"
import { CURVE_CONTEXT } from "@tangent/defi-resources/build/ressources/mappings/curveContext.js"
import { TransactionPrisma } from "../../../type/prisma.js"
import { PTS_PER_HOUR_TO_SECONDS_RATE } from "../config/config_lp_tasks.js"
import { PrismaClient } from "@prisma/client/extension"
import { PENDLE_POOLS } from "@tangent/defi-resources"
import { JsonRpcProvider } from "ethers"

const prisma = new PrismaClient()

async function main() {
  const provider = new JsonRpcProvider(process.env.CHAIN_RPCS!.split(",")[0])
  const now = new Date((await provider.getBlock("latest"))!.timestamp * 1000)

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await addCurve_LPTasks(tx, "DOLA_sUSDS", "curveApi", "factory-crvUSD", now)
    await addPendle_LP_PT_YTTasks(tx, "USDe 09/25/25", now)
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

/**
 * @notice Adds Curve LP-related tasks, price sources, and tracked tokens for a specific Curve pool.
 * @dev
 * This function executes all operations in a single transactional context using the provided Prisma client:
 * 1. Creates a price source for the LP token of the specified Curve pool.
 * 2. Creates four LP tasks:
 *    - Hold Curve LP tokens
 *    - Stake LP tokens in Curve gauge
 *    - Stake LP tokens in StakeDAO gauge
 *    - Stake LP tokens in Convex
 * 3. Adds tracked ERC-20 entries for all LP task tokens.
 * 4. Inserts an exclusion entry for the pool's Curve gauge into `lp_points_users_excluded`.
 *
 * Each LP task references the price source created in step 1.
 * Point rates are derived from `PTS_PER_HOUR_TO_SECONDS_RATE`.
 *
 * @param prisma Prisma transactional client for executing database operations atomically.
 * @param key Key identifying the Curve pool in `CURVE_CONTEXT`.
 * @param priceType Type of price source to associate with the LP token.
 * @param priceRef Other param used to find how to price the token.
 *
 * @example
 * ```ts
 * await addCurve_LPTasks(prisma, "frxUSD_crvUSD", "curveApi", "factory-crvUSD");
 * ```
 *
 * @notice After execution:
 * - A `price_source` exists for the LP token.
 * - `lp_task` entries exist for Curve, Curve gauge, StakeDAO, and Convex.
 * - `tracked_erc20` entries exist for all task tokens.
 * - `lp_points_users_excluded` contains the pool's Curve gauge address.
 */
async function addCurve_LPTasks(prisma: TransactionPrisma, key: keyof typeof CURVE_CONTEXT, priceType: PriceSourceType, priceRef: string, now: Date) {
  const ctx = CURVE_CONTEXT[key]
  const priceSources = await prisma.price_source.createManyAndReturn({
    data: [
      {
        name: key,
        type: priceType,
        reference: priceRef,
        address: ctx.curveLp,
      },
    ],
  })

  const lpTasks: Prisma.lp_taskCreateManyInput[] = [
    {
      name: key,
      action_type: "LP",
      protocol: "Curve",
      token_address: ctx.curveLp.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[40],
      description: `Hold Curve ${key} LP tokens`,
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-0/deposit",
      price_source_id: priceSources.find((p) => p.name.includes(key))!.id!,
      start_date: now,
    },
    {
      name: key,
      action_type: "LP",
      protocol: "Curve",
      token_address: ctx.curveGauge.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[20],
      description: `Stake ${key} LP in Curve gauge`,
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-1/deposit",
      price_source_id: priceSources.find((p) => p.name.includes(key))!.id!,
      start_date: now,
    },
    {
      name: key,
      action_type: "LP",
      protocol: "StakeDAO",
      token_address: ctx.stakeDaoVault.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[20],
      description: `Stake ${key} LP in StakeDAO gauge`,
      url: "https://www.stakedao.org/yield",
      price_source_id: priceSources.find((p) => p.name.includes(key))!.id!,
      start_date: now,
    },
    {
      name: key,
      action_type: "LP",
      protocol: "Convex",
      token_address: ctx.convexRewardToken.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[20],
      description: `Stake ${key} LP in Convex`,
      url: "http://mossad.com",
      price_source_id: priceSources.find((p) => p.name.includes(key))!.id!,
      start_date: now,
    },
  ]

  await prisma.tracked_erc20.createMany({
    data: lpTasks.map((t) => {
      return {
        address: t.token_address,
        name: t.name + " " + t.protocol,
        symbol: t.name + " " + t.protocol,
      }
    }),
  })

  await prisma.lp_task.createMany({
    data: lpTasks,
  })

  await prisma.lp_points_users_excluded.createMany({
    data: [ctx.curveGauge.toLowerCase()].map((uE) => ({ user: uE })),
  })
}

/**
 * @notice Adds Pendle LP, PT, and YT tasks, price sources, and tracked tokens for a specific Pendle pool.
 * @dev
 * This function executes all operations in a single transactional context using the provided Prisma client:
 * 1. Creates three price sources for the pool's MARKET, PT, and YT tokens using the Pendle API.
 * 2. Creates LP tasks for each token type:
 *    - Hold MARKET LP tokens
 *    - Hold PT tokens
 *    - Hold YT tokens
 * 3. Adds tracked ERC-20 entries for all task tokens.
 * 4. Inserts exclusion entries for the pool's MARKET and SY addresses into `lp_points_users_excluded`.
 *
 * Each LP task references the corresponding price source created in step 1.
 * Point rates are derived from `PTS_PER_HOUR_TO_SECONDS_RATE`.
 *
 * @param prisma Prisma transactional client for executing database operations atomically.
 * @param key Key identifying the Pendle pool in `PENDLE_POOLS`.
 *
 * @example
 * ```ts
 * await addPendle_LP_PT_YTTasks(prisma, "sUSDe 09/25/25");
 * ```
 *
 * @notice After execution:
 * - `price_source` entries exist for MARKET, PT, and YT tokens.
 * - `lp_task` entries exist for MARKET, PT, and YT.
 * - `tracked_erc20` entries exist for all task tokens.
 * - `lp_points_users_excluded` contains the pool's MARKET and SY addresses.
 */

async function addPendle_LP_PT_YTTasks(prisma: TransactionPrisma, key: keyof typeof PENDLE_POOLS, date: Date) {
  const ctx = PENDLE_POOLS[key]
  const priceSources = await prisma.price_source.createManyAndReturn({
    data: [
      {
        name: `MARKET ${key}`,
        type: "pendleApi",
        address: ctx.MARKET,
      },
      {
        name: `PT ${key}`,
        type: "pendleApi",
        address: ctx.PT,
      },
      {
        name: `YT ${key}`,
        type: "pendleApi",
        address: ctx.YT,
      },
    ],
  })

  const lpTasks: Prisma.lp_taskCreateManyInput[] = [
    {
      name: `MARKET ${key}`,
      action_type: "LP",
      protocol: "Pendle",
      token_address: ctx.MARKET.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[40],
      description: `Hold ${key} LP tokens`,
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-0/deposit",
      price_source_id: priceSources.find((p) => p.name.includes(`MARKET ${key}`))!.id!,
      start_date: date,
    },
    {
      name: `PT ${key}`,
      action_type: "PT",
      protocol: "Pendle",
      token_address: ctx.PT.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[10],
      description: `Hold ${key} PT tokens`,
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-1/deposit",
      price_source_id: priceSources.find((p) => p.name.includes(`PT ${key}`))!.id!,
      start_date: date,
    },
    {
      name: `YT ${key}`,
      action_type: "YT",
      protocol: "Pendle",
      token_address: ctx.YT.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[30],
      description: `Hold ${key} YT tokens`,
      url: "https://www.stakedao.org/yield",
      price_source_id: priceSources.find((p) => p.name.includes(`YT ${key}`))!.id!,
      start_date: date,
    },
  ]

  await prisma.tracked_erc20.createMany({
    data: lpTasks.map((t) => {
      return {
        address: t.token_address,
        name: t.name + " " + t.protocol,
        symbol: t.name + " " + t.protocol,
      }
    }),
  })

  await prisma.lp_task.createMany({
    data: lpTasks,
  })

  await prisma.lp_points_users_excluded.createMany({
    data: [ctx.MARKET.toLowerCase(), ctx.SY].map((uE) => ({ user: uE })),
  })
}
