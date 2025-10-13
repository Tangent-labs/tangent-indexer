import { CURVE_CONTEXT } from "@tangent/defi-resources/build/ressources/mappings/curveContext.js"
import { TransactionPrisma } from "../../type/prisma.js"
import { AddressesJson } from "type/data.js"

const ONE_HOUR = 3600
export const PTS_PER_HOUR_TO_SECONDS_RATE = {
  5: 5 / ONE_HOUR,
  10: 10 / ONE_HOUR,
  15: 15 / ONE_HOUR,
  20: 20 / ONE_HOUR,
  30: 30 / ONE_HOUR,
  40: 40 / ONE_HOUR,
}

export async function seedLPTasks(prisma: TransactionPrisma, addresses: AddressesJson) {
  await prisma.lp_task.createMany({
    data: [
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
      },
      {
        name: "USDe_USDC",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDe_USDC.curveLp.toLowerCase(),
        point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[30],
        description: "Hold Curve USDe/USDC LP tokens",
        url: "https://www.curve.finance/dex/ethereum/pools/factory-stable-ng-12/deposit",
        is_active: true,
      },
      {
        name: "crvUSD-USDT",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDT_crvUSD.curveLp.toLowerCase(),
        point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[30],
        description: "Hold Curve crvUSD/USDT LP tokens",
        url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-1/deposit",
        is_active: true,
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
      },
      {
        name: "USDe_USDC",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDe_USDC.curveGauge.toLowerCase(),
        point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
        description: "Stake USDe/USDC LP in Curve gauge",
        url: "https://www.curve.finance/dex/ethereum/pools/factory-stable-ng-12/deposit",
        is_active: true,
      },
      {
        name: "crvUSD-USDT",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDT_crvUSD.curveGauge.toLowerCase(),
        point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
        description: "Stake crvUSD/USDT LP in Curve gauge",
        url: "https://www.curve.finance/dex/ethereum/pools/factory-crvusd-1/deposit",
        is_active: true,
      },
      // Stake Curve LP in StakeDao
      {
        name: "crvUSD_USDC",
        action_type: "LP",
        protocol: "StakeDAO",
        token_address: CURVE_CONTEXT.USDC_crvUSD.stakeDaoGauge.toLowerCase(),
        point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[20],
        description: "Stake crvUSD/USDC LP in StakeDAO gauge",
        url: "https://www.stakedao.org/yield",
        is_active: true,
      },
      {
        name: "USDe_USDC",
        action_type: "LP",
        protocol: "StakeDAO",
        token_address: CURVE_CONTEXT.USDe_USDC.stakeDaoGauge.toLowerCase(),
        point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
        description: "Stake USDe/USDC LP in StakeDAO gauge",
        url: "https://www.stakedao.org/yield",
        is_active: true,
      },
      {
        name: "crvUSD_USDT",
        action_type: "LP",
        protocol: "StakeDAO",
        token_address: CURVE_CONTEXT.USDT_crvUSD.stakeDaoGauge.toLowerCase(),
        point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
        description: "Stake crvUSD/USDT LP in StakeDAO gauge",
        url: "https://www.stakedao.org/yield",
        is_active: true,
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
      },
      {
        name: "USDe_USDC",
        action_type: "LP",
        protocol: "Convex",
        token_address: CURVE_CONTEXT.USDe_USDC.convexRewardToken.toLowerCase(),
        point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[15],
        description: "Stake USDe/USDC LP on Convex",
        url: "https://curve.convexfinance.com/stake/ethereum/444",
        is_active: true,
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
      },
    ],
  })
}
