import { PrismaClient } from "@prisma/client"
import { CURVE_CONTEXT } from "@tangent/defi-resources/build/ressources/mappings/curveContext"

const prisma = new PrismaClient()

async function seedTasks() {
  await prisma.task.createMany({
    data: [
      {
        name: "USG",
        action_type: "hold",
        protocol: "tangent",
        token_address: "0x9b894B86F16EC30656aB6dd51e0fD620e70f630b".toLowerCase(),
        point_rate: 1.5,
        unit: "hour",
        description: "Hold USG in your wallet",
        url: "https://curve.fi/deposit", // if you have a better USG page, swap it in
        is_active: true,
      },

      // Curve USDe/USDC — LP in wallet
      {
        name: "USDe_USDC",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDe_USDC.curveLp.toLowerCase(),
        point_rate: 1.5,
        unit: "hour",
        description: "Hold Curve USDe/USDC LP tokens",
        url: "https://curve.fi/",
        is_active: true,
      },
      // Curve USDe/USDC — staked in Curve gauge
      {
        name: "USDe_USDC",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDe_USDC.curveGauge.toLowerCase(),
        point_rate: 1.5,
        unit: "hour",
        description: "Stake USDe/USDC LP in Curve gauge",
        url: "https://curve.fi/",
        is_active: true,
      },

      // Curve crvUSD/USDC — LP in wallet
      {
        name: "crvUSD_USDC",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDC_crvUSD.curveLp.toLowerCase(),
        point_rate: 1.5,
        unit: "hour",
        description: "Hold Curve crvUSD/USDC LP tokens",
        url: "https://curve.fi/",
        is_active: true,
      },
      // StakeDAO crvUSD/USDC — staked in StakeDAO gauge
      {
        name: "crvUSD_USDC",
        action_type: "LP",
        protocol: "StakeDAO",
        token_address: CURVE_CONTEXT.USDC_crvUSD.stakeDaoGauge.toLowerCase(),
        point_rate: 2.0,
        unit: "hour",
        description: "Stake crvUSD/USDC LP in StakeDAO gauge",
        url: "https://www.stakedao.org/",
        is_active: true,
      },

      // Curve crvUSD/USDT — LP in wallet
      {
        name: "crvUSD-USDT",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDT_crvUSD.curveLp.toLowerCase(),
        point_rate: 2.0,
        unit: "hour",
        description: "Hold Curve crvUSD/USDT LP tokens",
        url: "https://curve.fi/",
        is_active: true,
      },
      // StakeDAO crvUSD/USDT — staked in StakeDAO gauge
      {
        name: "crvUSD-USDT",
        action_type: "LP",
        protocol: "StakeDAO",
        token_address: CURVE_CONTEXT.USDT_crvUSD.stakeDaoGauge.toLowerCase(),
        point_rate: 2.0,
        unit: "hour",
        description: "Stake crvUSD/USDT LP in StakeDAO gauge",
        url: "https://www.stakedao.org/",
        is_active: true,
      },
    ],
  })
}

seedTasks()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
