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
        token_address: "0xdf422894281A27Aa3d19B0B7D578c59Cb051ABF8".toLowerCase(),
        point_rate: 1.5,
        unit: "hour",
        description: "Hold USG",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
      {
        name: "USDe_USDC",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDe_USDC.curveLp.toLowerCase(), // USDe_USDC Address
        point_rate: 1.5,
        unit: "hour",
        description: "Deposit LP tokens on Curve",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
      {
        name: "USDe_USDC",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDe_USDC.curveGauge.toLowerCase(), // USDe_USDC Address
        point_rate: 1.5,
        unit: "hour",
        description: "Deposit LP tokens on Curve",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
      {
        name: "crvUSD-USDC",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDC_crvUSD.curveLp.toLowerCase(), // crvUSD-USDC Address
        point_rate: 1.5,
        unit: "hour",
        description: "Deposit LP tokens on Curve",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
      {
        name: "crvUSD-USDC",
        action_type: "LP",
        protocol: "stakeDAO",
        token_address: CURVE_CONTEXT.USDC_crvUSD.stakeDaoGauge.toLowerCase(), // crvUSD-USDC Address
        point_rate: 2.0,
        unit: "hour",
        description: "Stake LP tokens on stakeDAO",
        url: "https://stakedao.org/stake",
        is_active: true,
      },
      {
        name: "crvUSD-USDT",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDT_crvUSD.curveLp.toLowerCase(), // USDT_crvUSD Address
        point_rate: 2.0,
        unit: "hour",
        description: "Stake LP tokens on stakeDAO",
        url: "https://stakedao.org/stake",
        is_active: true,
      },
      {
        name: "crvUSD-USDT",
        action_type: "LP",
        protocol: "stakeDAO",
        token_address: CURVE_CONTEXT.USDT_crvUSD.stakeDaoGauge.toLowerCase(), // crvUSD-USDC Address
        point_rate: 2.0,
        unit: "hour",
        description: "Stake LP tokens on stakeDAO",
        url: "https://stakedao.org/stake",
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
