import { CURVE_CONTEXT } from "@tangent/defi-resources/build/ressources/mappings/curveContext.js"
import { AddressesJson } from "../../type/data.js"
import { TransactionPrisma } from "../../type/prisma.js"
import { ZeroAddress } from "ethers"
import { CONVEX_LOCKER } from "@tangent/defi-resources/build/ressources/contracts/convex.js"
import { PendlePools } from "@tangent/defi-resources"
import { Prisma } from "@prisma/client"

const ONE_HOUR = 3600
export const PTS_PER_HOUR_TO_SECONDS_RATE = {
  5: 5 / ONE_HOUR,
  10: 10 / ONE_HOUR,
  15: 15 / ONE_HOUR,
  20: 20 / ONE_HOUR,
  30: 30 / ONE_HOUR,
  40: 40 / ONE_HOUR,
}
function TASKS(addresses: AddressesJson, priceSources: Prisma.price_sourceCreateManyInput[]) {
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
      is_active: true,
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
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("sUSG"))!.id!,
    },
    // Hold Curve LP unstaked
    {
      name: "crvUSD_USDC",
      action_type: "LP",
      protocol: "Curve",
      token_address: CURVE_CONTEXT.USDC_crvUSD.curveLp.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[40],
      description: "Hold Curve crvUSD/USDC LP tokens",
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-0/deposit",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
    },
    {
      name: "DOLA_sUSDS",
      action_type: "LP",
      protocol: "Curve",
      token_address: CURVE_CONTEXT.DOLA_sUSDS.curveLp.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[30],
      description: "Hold Curve DOLA/sUSDS LP tokens",
      url: "https://www.curve.finance/dex/ethereum/pools/factory-stable-ng-12/deposit",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("DOLA_sUSDS"))!.id!,
    },
    {
      name: "crvUSD_USDT",
      action_type: "LP",
      protocol: "Curve",
      token_address: CURVE_CONTEXT.USDT_crvUSD.curveLp.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[30],
      description: "Hold Curve crvUSD/USDT LP tokens",
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-1/deposit",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("USDT_crvUSD"))!.id!,
    },
    {
      name: "Llamalend sDOLA/crvUSD",
      action_type: "LP",
      protocol: "Llamalend",
      token_address: CURVE_CONTEXT.LLAMALEND_sDOLA_crvUSD.curveLp.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[40],
      description: "Supply crvUSD to sDOLA lenders",
      url: "https://www.curve.finance/lend/ethereum/markets/one-way-market-30/create",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("LLAMALEND_sDOLA_crvUSD"))!.id!,
    },
    // Stake Curve LP in Curve Gauge
    {
      name: "crvUSD_USDC",
      action_type: "LP",
      protocol: "Curve",
      token_address: CURVE_CONTEXT.USDC_crvUSD.curveGauge.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[20],
      description: "Stake crvUSD/USDC LP in Curve gauge",
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-1/deposit",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
    },
    {
      name: "DOLA_sUSDS",
      action_type: "LP",
      protocol: "Curve",
      token_address: CURVE_CONTEXT.DOLA_sUSDS.curveGauge.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
      description: "Stake USDe/USDC LP in Curve gauge",
      url: "https://www.curve.finance/dex/ethereum/pools/factory-stable-ng-12/deposit",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("DOLA_sUSDS"))!.id!,
    },
    {
      name: "crvUSD_USDT",
      action_type: "LP",
      protocol: "Curve",
      token_address: CURVE_CONTEXT.USDT_crvUSD.curveGauge.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
      description: "Stake crvUSD/USDT LP in Curve gauge",
      url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-1/deposit",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("USDT_crvUSD"))!.id!,
    },

    {
      name: "Llamalend sDOLA/crvUSD",
      action_type: "LP",
      protocol: "Llamalend",
      token_address: CURVE_CONTEXT.LLAMALEND_sDOLA_crvUSD.curveGauge.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[20],
      description: "Supply crvUSD to sDOLA lenders and stake on Curve",
      url: "https://www.curve.finance/lend/ethereum/markets/one-way-market-30/create",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("LLAMALEND_sDOLA_crvUSD"))!.id!,
    },
    // Stake Curve LP in StakeDao
    {
      name: "crvUSD_USDC",
      action_type: "LP",
      protocol: "StakeDAO",
      token_address: CURVE_CONTEXT.USDC_crvUSD.stakeDaoVault.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[20],
      description: "Stake crvUSD/USDC LP in StakeDAO gauge",
      url: "https://www.stakedao.org/yield",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
    },
    {
      name: "DOLA_sUSDS",
      action_type: "LP",
      protocol: "StakeDAO",
      token_address: CURVE_CONTEXT.DOLA_sUSDS.stakeDaoVault.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
      description: "Stake DOLA/sUSDS LP in StakeDAO gauge",
      url: "https://www.stakedao.org/yield",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("DOLA_sUSDS"))!.id!,
    },
    {
      name: "crvUSD_USDT",
      action_type: "LP",
      protocol: "StakeDAO",
      token_address: CURVE_CONTEXT.USDT_crvUSD.stakeDaoVault.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
      description: "Stake crvUSD/USDT LP in StakeDAO gauge",
      url: "https://www.stakedao.org/yield",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("USDT_crvUSD"))!.id!,
    },
    {
      name: "Llamalend sDola/crvUSD",
      action_type: "LP",
      protocol: "StakeDao",
      token_address: CURVE_CONTEXT.LLAMALEND_sDOLA_crvUSD.stakeDaoVault.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[20],
      description: "Supply crvUSD to sDOLA lenders and stake on StakeDao",
      url: "https://www.curve.finance/lend/ethereum/markets/one-way-market-30/create",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("LLAMALEND_sDOLA_crvUSD"))!.id!,
    },

    // Stake Curve LP in Convex
    {
      name: "crvUSD_USDC",
      action_type: "LP",
      protocol: "Convex",
      token_address: CURVE_CONTEXT.USDC_crvUSD.convexRewardToken.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[20],
      description: "Stake crvUSD/USDC LP on Convex",
      url: "https://curve.convexfinance.com/stake/ethereum/444",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("USDC_crvUSD"))!.id!,
    },
    {
      name: "DOLA_sUSDS",
      action_type: "LP",
      protocol: "Convex",
      token_address: CURVE_CONTEXT.DOLA_sUSDS.convexRewardToken.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
      description: "Stake DOLA/sUSDS LP on Convex",
      url: "https://curve.convexfinance.com/stake/ethereum/444",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("DOLA_sUSDS"))!.id!,
    },
    {
      name: "crvUSD_USDT",
      action_type: "LP",
      protocol: "Convex",
      token_address: CURVE_CONTEXT.USDT_crvUSD.convexRewardToken.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
      description: "Stake crvUSD/USDT LP on Convex",
      url: "https://curve.convexfinance.com/stake/ethereum/444",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("USDT_crvUSD"))!.id!,
    },
    {
      name: "Llamalend sDola/crvUSD",
      action_type: "LP",
      protocol: "Convex",
      token_address: CURVE_CONTEXT.LLAMALEND_sDOLA_crvUSD.convexRewardToken.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[20],
      description: "Supply crvUSD to sDOLA lenders and stake on Convex",
      url: "https://www.curve.finance/lend/ethereum/markets/one-way-market-30/create",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("LLAMALEND_sDOLA_crvUSD"))!.id!,
    },
    // PENDLE
    {
      name: "YT sUSDe 27/11/25",
      action_type: "YT",
      protocol: "Pendle",
      token_address: PendlePools["sUSDe 27/11/25"].YT.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[30],
      description: "Hold YT sUSDe 27/11/25",
      url: "https://app.pendle.finance/trade/markets/0xb6ac3d5da138918ac4e84441e924a20daa60dbdd/swap?view=yt&chain=ethereum",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("YT sUSDe 27/11/25"))!.id!,
    },
    {
      name: "LP sUSDe 27/11/25",
      action_type: "LP",
      protocol: "Pendle",
      token_address: PendlePools["sUSDe 27/11/25"].MARKET.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[30],
      description: "Hold LP sUSDe 27/11/25",
      url: "https://app.pendle.finance/trade/pools/0xb6ac3d5da138918ac4e84441e924a20daa60dbdd/zap/in?chain=ethereum",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("LP sUSDe 27/11/25"))!.id!,
    },
    {
      name: "PT sUSDe 27/11/25",
      action_type: "PT",
      protocol: "Pendle",
      token_address: PendlePools["sUSDe 27/11/25"].PT.toLowerCase(),
      point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
      description: "Hold PT sUSDe 27/11/25",
      url: "https://app.pendle.finance/trade/markets/0xb6ac3d5da138918ac4e84441e924a20daa60dbdd/swap?view=pt&chain=ethereum",
      is_active: true,
      price_source_id: priceSources.find((p) => p.name.includes("PT sUSDe 27/11/25"))!.id!,
    },
  ]
  return tasks
}

export async function seedLPTasksAndTrackedERC20(prisma: TransactionPrisma, addresses: AddressesJson, priceSources: Prisma.price_sourceCreateManyInput[]) {
  const lpTasks = TASKS(addresses, priceSources)

  await prisma.tracked_erc20.createMany({
    data: lpTasks.map((t) => ({
      address: t.token_address,
      name: t.name + " " + t.protocol,
      symbol: t.name + " " + t.protocol,
    })),
  })

  await prisma.lp_task.createMany({
    data: lpTasks,
  })

  // TODO This needs to be update when we know the list
  const addressesToExclude = [
    ZeroAddress.toLowerCase(),
    CONVEX_LOCKER.toLowerCase(),
    // TODO add addresses of StakeDao and StakeDao staking on Convex

    // Remove curve gauge
    CURVE_CONTEXT.USDC_crvUSD.curveGauge.toLowerCase(),
    CURVE_CONTEXT.USDT_crvUSD.curveGauge.toLowerCase(),
    CURVE_CONTEXT.DOLA_sUSDS.curveGauge.toLowerCase(),
    CURVE_CONTEXT.LLAMALEND_sDOLA_crvUSD.curveGauge.toLowerCase(),

    // Remove Pendle Market because it holds PT
    PendlePools["sUSDe 27/11/25"].MARKET.toLowerCase(),
  ].map((uE) => ({ user: uE }))

  await prisma.lp_points_users_excluded.createMany({
    data: addressesToExclude,
  })
}
