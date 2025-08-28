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
        token_address: "0x6d7EFb67236AaAeC2005ec704Bf5d755dd0703c4".toLowerCase(),
        point_rate: 1.5,
        unit: "hour",
        description: "Hold USG in your wallet",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
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
