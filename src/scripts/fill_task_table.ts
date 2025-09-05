import { PrismaClient } from "@prisma/client"
import { CURVE_CONTEXT } from "defi-resources/build/ressources/mappings/curveContext"

const prisma = new PrismaClient()

async function seedTasks() {
  await prisma.task.createMany({
    data: [
      {
        name: "USG",
        action_type: "hold",
        protocol: "tangent",
        token_address: "0xbd605Ad2010E12c16B0cd0F2B8FE3c6d90BB51E7".toLowerCase(),
        point_rate: 0.00417,
        description: "Hold USG in your wallet",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
      {
        name: "USDe_USDC",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDe_USDC.curveLp.toLowerCase(),
        point_rate: 0.00417,
        description: "Hold Curve USDe/USDC LP tokens",
        url: "https://curve.fi/",
        is_active: true,
      },
      {
        name: "USDe_USDC",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDe_USDC.curveGauge.toLowerCase(),
        point_rate: 0.00417,
        description: "Stake USDe/USDC LP in Curve gauge",
        url: "https://curve.fi/",
        is_active: true,
      },
      {
        name: "crvUSD_USDC",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDC_crvUSD.curveLp.toLowerCase(),
        point_rate: 0.00417,
        description: "Hold Curve crvUSD/USDC LP tokens",
        url: "https://curve.fi/",
        is_active: true,
      },
      {
        name: "crvUSD_USDC",
        action_type: "LP",
        protocol: "StakeDAO",
        token_address: CURVE_CONTEXT.USDC_crvUSD.stakeDaoGauge.toLowerCase(),
        point_rate: 0.00556,
        description: "Stake crvUSD/USDC LP in StakeDAO gauge",
        url: "https://www.stakedao.org/",
        is_active: true,
      },
      {
        name: "crvUSD-USDT",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDT_crvUSD.curveLp.toLowerCase(),
        point_rate: 0.0556,
        description: "Hold Curve crvUSD/USDT LP tokens",
        url: "https://curve.fi/",
        is_active: true,
      },
      {
        name: "crvUSD-USDT",
        action_type: "LP",
        protocol: "StakeDAO",
        token_address: CURVE_CONTEXT.USDT_crvUSD.stakeDaoGauge.toLowerCase(),
        point_rate: 0.00556,
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
