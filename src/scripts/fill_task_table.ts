import { PrismaClient } from "@prisma/client"
import { CURVE_CONTEXT } from "defi-resources/build/ressources/mappings/curveContext"

const prisma = new PrismaClient()

async function seedTasks() {
  await prisma.task.createMany({
    data: [
      {
        name: "Hold USG",
        action_type: "hold",
        protocol: "tangent",
        token_address: "0x86B430cF6539183AaB3385Bb901272F1aeA7daDC".toLowerCase(),
        point_rate: 1.5,
        unit: "hour",
        description: "Hold USG",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
      {
        name: "Deposit Curve LP USDe_USDC",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDe_USDC.curveLp.toLowerCase(), // USDe_USDC Address
        point_rate: 1.5,
        unit: "hour",
        description: "Deposit liquidity provider tokens on Curve",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
      {
        name: "Deposit Curve Gauge USDe_USDC",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDe_USDC.curveGauge.toLowerCase(), // USDe_USDC Address
        point_rate: 1.5,
        unit: "hour",
        description: "Deposit liquidity provider tokens on Curve",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
      {
        name: "Deposit some LP on Curve USDC_crvUSD",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDC_crvUSD.curveLp.toLowerCase(), // crvUSD-USDC Address
        point_rate: 1.5,
        unit: "hour",
        description: "Deposit liquidity provider tokens on Curve",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
      {
        name: "Stake some LP on stakeDAO USDC_crvUSD",
        action_type: "LP",
        protocol: "stakeDAO",
        token_address: CURVE_CONTEXT.USDC_crvUSD.stakeDaoGauge.toLowerCase(), // crvUSD-USDC Address
        point_rate: 2.0,
        unit: "hour",
        description: "Stake liquidity provider tokens on stakeDAO",
        url: "https://stakedao.org/stake",
        is_active: true,
      },
      {
        name: "Hold USDT_crvUSD LP",
        action_type: "LP",
        protocol: "Curve",
        token_address: CURVE_CONTEXT.USDT_crvUSD.curveLp.toLowerCase(), // USDT_crvUSD Address
        point_rate: 2.0,
        unit: "hour",
        description: "Stake liquidity provider tokens on stakeDAO",
        url: "https://stakedao.org/stake",
        is_active: true,
      },
      {
        name: "Stake some LP on stakeDAO USDT_crvUSD",
        action_type: "LP",
        protocol: "stakeDAO",
        token_address: CURVE_CONTEXT.USDT_crvUSD.stakeDaoGauge.toLowerCase(), // crvUSD-USDC Address
        point_rate: 2.0,
        unit: "hour",
        description: "Stake liquidity provider tokens on stakeDAO",
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
