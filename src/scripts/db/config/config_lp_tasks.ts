import { Prisma } from "@prisma/client"
import { CURVE_CONTEXT } from "@tangent/defi-resources"
import { AddressesJson } from "../../../type/data.js"

const ONE_HOUR = 3600
export const PTS_PER_HOUR_TO_SECONDS_RATE = {
  5: 5 / ONE_HOUR,
  10: 10 / ONE_HOUR,
  15: 15 / ONE_HOUR,
  20: 20 / ONE_HOUR,
  30: 30 / ONE_HOUR,
  40: 40 / ONE_HOUR,
}
export function LP_TASKS(addresses: AddressesJson, priceSources: Prisma.price_sourceCreateManyInput[], now: Date) {
  const ctx = CURVE_CONTEXT.CURVE_CONTEXT
  // Retrieve the price source ID for each lp_tasks
  const tasks: Prisma.lp_taskCreateManyInput[] = [
    // USG
    {
      name: "USG",
      action_type: "Hold",
      protocol: "Tangent",
      token_address: addresses.tokens.USG.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
      description: "Hold USG in your wallet",
      url: "https://usg.tangent.finance",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name === "USG")!.id!,
    },
    {
      name: "sUSG",
      action_type: "Hold",
      protocol: "Tangent",
      token_address: addresses.tokens.sUSG.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[10],
      description: "Hold sUSG in your wallet",
      url: "https://usg.tangent.finance",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("sUSG"))!.id!,
    },
    // Hold Curve LP unstaked
    {
      name: "USG-USDC",
      action_type: "LP",
      protocol: "Curve",
      token_address: addresses.lps["USG-USDC"].toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[40],
      description: "Hold Curve USG/USDC LP tokens",
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-0/deposit",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
    },
    {
      name: "USG-frxUSD",
      action_type: "LP",
      protocol: "Curve",
      token_address: addresses.lps["USG-frxUSD"].toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[40],
      description: "Hold Curve USG/frxUSD LP tokens",
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-0/deposit",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
    },
    {
      name: "crvUSD_USDC",
      action_type: "LP",
      protocol: "Curve",
      token_address: ctx.USDC_crvUSD.curveLp.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[40],
      description: "Hold Curve crvUSD/USDC LP tokens",
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-0/deposit",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
    },
    {
      name: "crvUSD_USDT",
      action_type: "LP",
      protocol: "Curve",
      token_address: ctx.USDT_crvUSD.curveLp.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[30],
      description: "Hold Curve crvUSD/USDT LP tokens",
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-1/deposit",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDT_crvUSD"))!.id!,
    },
    // Stake Curve LP in Curve Gauge
    {
      name: "crvUSD_USDC",
      action_type: "LP",
      protocol: "Curve",
      token_address: ctx.USDC_crvUSD.curveGauge.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[20],
      description: "Stake crvUSD/USDC LP in Curve gauge",
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-1/deposit",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
    },
    {
      name: "crvUSD_USDT",
      action_type: "LP",
      protocol: "Curve",
      token_address: ctx.USDT_crvUSD.curveGauge.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
      description: "Stake crvUSD/USDT LP in Curve gauge",
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-1/deposit",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDT_crvUSD"))!.id!,
    },
    // Stake Curve LP in StakeDao
    {
      name: "crvUSD_USDC",
      action_type: "LP",
      protocol: "StakeDAO",
      token_address: ctx.USDC_crvUSD.stakeDaoVault.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[20],
      description: "Stake crvUSD/USDC LP in Stake DAO gauge",
      url: "https://www.stakedao.org/yield",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
    },
    {
      name: "crvUSD_USDT",
      action_type: "LP",
      protocol: "StakeDAO",
      token_address: ctx.USDT_crvUSD.stakeDaoVault.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
      description: "Stake crvUSD/USDT LP in Stake DAO gauge",
      url: "https://www.stakedao.org/yield",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDT_crvUSD"))!.id!,
    },

    // Stake Curve LP in Convex
    {
      name: "crvUSD_USDC",
      action_type: "LP",
      protocol: "Convex",
      token_address: ctx.USDC_crvUSD.convexRewardToken.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[20],
      description: "Stake crvUSD/USDC LP on Convex",
      url: "https://curve.convexfinance.com/stake/ethereum/444",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
    },
    {
      name: "crvUSD_USDT",
      action_type: "LP",
      protocol: "Convex",
      token_address: ctx.USDT_crvUSD.convexRewardToken.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
      description: "Stake crvUSD/USDT LP on Convex",
      url: "https://curve.convexfinance.com/stake/ethereum/444",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDT_crvUSD"))!.id!,
    },
  ]
  return tasks
}
