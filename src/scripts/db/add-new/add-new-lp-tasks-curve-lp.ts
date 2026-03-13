import { PriceSourceType, Prisma, PrismaClient } from "@prisma/client"
import { CURVE_CONTEXT } from "@tangent/defi-resources/build/ressources/mappings/curveContext.js"
import { TransactionPrisma } from "../../../type/prisma.js"
import { JsonRpcProvider } from "ethers"
import { PTS_PER_DAY_TO_SECONDS_RATE } from "../config/config_lp_tasks.js"

const prisma = new PrismaClient()

async function main() {
  const provider = new JsonRpcProvider(process.env.CHAIN_RPCS!.split(",")[0])
  const now = new Date((await provider.getBlock("latest"))!.timestamp * 1000)

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await addCurve_LPTasks(tx, "frxUSD_crvUSD", "curveApi", "factory-crvUSD", now)
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
 *    - Stake LP tokens in Stake DAO gauge
 *    - Stake LP tokens in Convex
 * 3. Adds tracked ERC-20 entries for all LP task tokens.
 * 4. Inserts an exclusion entry for the pool's Curve gauge into `lp_points_users_excluded`.
 *
 * Each LP task references the price source created in step 1.
 * Point rates are derived from `PTS_PER_DAY_TO_SECONDS_RATE`.
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
        address: ctx.curveLp.toLowerCase(),
      },
    ],
  })

  const lpTasks: Prisma.lp_taskCreateManyInput[] = [
    {
      name: key,
      action_type: "LP",
      protocol: "Curve",
      token_address: ctx.curveLp.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[45],
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
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
      description: `Stake ${key} LP on Curve gauge`,
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-1/deposit",
      price_source_id: priceSources.find((p) => p.name.includes(key))!.id!,
      start_date: now,
    },
    {
      name: key,
      action_type: "LP",
      protocol: "StakeDAO",
      token_address: ctx.stakeDaoVault.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
      description: `Stake ${key} LP on Stake DAO gauge`,
      url: "https://www.stakedao.org/yield",
      price_source_id: priceSources.find((p) => p.name.includes(key))!.id!,
      start_date: now,
    },
    {
      name: key,
      action_type: "LP",
      protocol: "Convex",
      token_address: ctx.convexRewardToken.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
      description: `Stake ${key} LP on Convex`,
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
