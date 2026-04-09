import { Prisma } from "@prisma/client"
import { CURVE_CONTEXT } from "@tangent/defi-resources"
import { AddressesJson } from "../../../type/data.js"

const ONE_DAY = 86400
export const PTS_PER_DAY_TO_SECONDS_RATE = {
  1: 1 / ONE_DAY,
  10: 10 / ONE_DAY,
  15: 15 / ONE_DAY,
  30: 30 / ONE_DAY,
  45: 45 / ONE_DAY,
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
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[30],
      description: "Hold USG in your wallet",
      url: "https://app.tangent.finance/swap?tokenIn=0xb1c2db5d6ca03fce73dbd304d320bf76c55ae1b1&tokenOut=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name === "USG")!.id!,
      can_zap: true,
    },
    {
      name: "sUSG",
      action_type: "Hold",
      protocol: "Tangent",
      token_address: addresses.tokens.sUSG.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
      description: "Hold sUSG in your wallet",
      url: "https://app.tangent.finance/stake",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("sUSG"))!.id!,
      can_zap: true,
    },
    // Hold Curve LP unstaked
    {
      name: "USG-USDC",
      action_type: "LP",
      protocol: "Curve",
      token_address: addresses.lps["USG-USDC"].toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[45],
      description: "Hold Curve USG/USDC LP tokens",
      url: "https://www.curve.finance/dex/ethereum/pools/0x97ba10115da528c113462ede9c20d7adc806d93f/deposit",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
      can_zap: true,
    },
    {
      name: "USG-frxUSD",
      action_type: "LP",
      protocol: "Curve",
      token_address: addresses.lps["USG-frxUSD"].toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[45],
      description: "Hold Curve USG/frxUSD LP tokens",
      url: "https://www.curve.finance/dex/ethereum/pools/0xefc056790bb19702b2164ec6ea6ba3ae01d81195/deposit",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDT_crvUSD"))!.id!,
      can_zap: true,
    },
    // Stake Curve LP in Curve Gauge
    {
      name: "USG-USDC",
      action_type: "LP",
      protocol: "Curve",
      token_address: ctx.USG_USDC.curveGauge.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
      description: "Stake USG/USDC LP on Curve gauge",
      url: "https://www.curve.finance/dex/ethereum/pools/0x97ba10115da528c113462ede9c20d7adc806d93f/deposit",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
      can_zap: true,
    },

    {
      name: "USG-frxUSD",
      action_type: "LP",
      protocol: "Curve",
      token_address: ctx.USG_frxUSD.curveGauge.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
      description: "Stake USG/USDC LP on Curve gauge",
      url: "https://www.curve.finance/dex/ethereum/pools/0xefc056790bb19702b2164ec6ea6ba3ae01d81195/deposit",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDT_crvUSD"))!.id!,
      can_zap: true,
    },
    // Stake Curve LP in Stake DAO
    {
      name: "USG-USDC",
      action_type: "LP",
      protocol: "StakeDAO",
      token_address: ctx.USG_USDC.stakeDaoVault.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
      description: "Stake USG/USDC LP on Stake DAO",
      url: "https://stakedao.org/yield?search=0x52Cd58C160A51C2207504A6d28975C8f981ea8E8",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
      can_zap: true,
    },
    {
      name: "USG-frxUSD",
      action_type: "LP",
      protocol: "StakeDAO",
      token_address: ctx.USG_frxUSD.stakeDaoVault.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
      description: "Stake USG/frxUSD LP on Stake DAO",
      url: "https://stakedao.org/yield?search=0x39b1df92f9485A73cAdF4846aBDe59eac0901A94",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDT_crvUSD"))!.id!,
      can_zap: true,
    },

    // Stake Curve LP in Convex
    {
      name: "USG-USDC",
      action_type: "LP",
      protocol: "Convex",
      token_address: ctx.USG_USDC.convexRewardToken.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
      description: "Stake USG/USDC LP on Convex",
      url: "https://curve.convexfinance.com/stake/ethereum/541",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
      can_zap: false,
    },
    {
      name: "USG-frxUSD",
      action_type: "LP",
      protocol: "Convex",
      token_address: ctx.USG_frxUSD.convexRewardToken.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
      description: "Stake USG/frxUSD LP on Convex",
      url: "https://curve.convexfinance.com/stake/ethereum/542",
      start_date: now,
      price_source_id: priceSources.find((p) => p.name.includes("USDT_crvUSD"))!.id!,
      can_zap: false,
    },
  ]
  return tasks
}
