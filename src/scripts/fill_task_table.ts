import { PrismaClient } from "@prisma/client"
import { CURVE_CONTEXT } from "defi-resources/build/ressources/mappings/curveContext"

const prisma = new PrismaClient()

async function seedTasks() {
  await prisma.task.createMany({
    data: [
      {
        name: "Deposit Curve LP USDe_USDC",
        action_type: "LP",
        protocol: "Curve",
        token: CURVE_CONTEXT["USDe_USDC"].curveLp, // USDe_USDC Address
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
        token: CURVE_CONTEXT["USDe_USDC"].curveGauge, // USDe_USDC Address
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
        token: CURVE_CONTEXT["USDC_crvUSD"].curveLp, // crvUSD-USDC Address
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
        token: CURVE_CONTEXT["USDC_crvUSD"].stakeDaoVault, // crvUSD-USDC Address
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
        token: CURVE_CONTEXT["USDT_crvUSD"].stakeDaoVault, // crvUSD-USDC Address
        point_rate: 2.0,
        unit: "hour",
        description: "Stake liquidity provider tokens on stakeDAO",
        url: "https://stakedao.org/stake",
        is_active: true,
      },
    ],
  })

  console.log("Tasks seeded successfully")
}

seedTasks()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
