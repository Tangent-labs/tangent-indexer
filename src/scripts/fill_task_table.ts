import { PrismaClient } from "@prisma/client"
import { CURVE_CONTEXT } from "defi-resources/build/ressources/mappings/curveContext"

const prisma = new PrismaClient()

async function seedTasks() {
  await prisma.task.createMany({
    data: [
      {
        name: "Move USDe",
        action_type: "move USDe",
        protocol: "USDe",
        token_address: "0xa569d910839Ae8865Da8F8e70FfFb0cBA869F961", // USDe Address
        point_rate: 1.5,
        unit: "hour",
        description: "USDe",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
      {
        name: "Move crvUSD",
        action_type: "move crvUSD",
        protocol: "crvUSD",
        token_address: "0xeef0c605546958c1f899b6fb336c20671f9cd49f", // crvUSD Address
        point_rate: 1.5,
        unit: "hour",
        description: "crvUSD",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
      {
        name: "Hold USG",
        action_type: "hold",
        protocol: "tangent",
        token_address: "0x5f9dc06607e947742ef1b837b952ea0728b1748f", // USG Address
        point_rate: 1.5,
        unit: "hour",
        description: "Hold USG",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
      // {
      //   name: "Deposit Curve LP USDe_USDC",
      //   action_type: "LP",
      //   protocol: "Curve",
      //   token_address: CURVE_CONTEXT["USDe_USDC"].curveLp, // USDe_USDC Address
      //   point_rate: 1.5,
      //   unit: "hour",
      //   description: "Deposit liquidity provider tokens on Curve",
      //   url: "https://curve.fi/deposit",
      //   is_active: true,
      // },
      // {
      //   name: "Deposit Curve Gauge USDe_USDC",
      //   action_type: "LP",
      //   protocol: "Curve",
      //   token_address: CURVE_CONTEXT["USDe_USDC"].curveGauge, // USDe_USDC Address
      //   point_rate: 1.5,
      //   unit: "hour",
      //   description: "Deposit liquidity provider tokens on Curve",
      //   url: "https://curve.fi/deposit",
      //   is_active: true,
      // },
      // {
      //   name: "Deposit some LP on Curve USDC_crvUSD",
      //   action_type: "LP",
      //   protocol: "Curve",
      //   token_address: CURVE_CONTEXT["USDC_crvUSD"].curveLp, // crvUSD-USDC Address
      //   point_rate: 1.5,
      //   unit: "hour",
      //   description: "Deposit liquidity provider tokens on Curve",
      //   url: "https://curve.fi/deposit",
      //   is_active: true,
      // },
      // {
      //   name: "Stake some LP on stakeDAO USDC_crvUSD",
      //   action_type: "LP",
      //   protocol: "stakeDAO",
      //   token_address: CURVE_CONTEXT["USDC_crvUSD"].stakeDaoGauge, // crvUSD-USDC Address
      //   point_rate: 2.0,
      //   unit: "hour",
      //   description: "Stake liquidity provider tokens on stakeDAO",
      //   url: "https://stakedao.org/stake",
      //   is_active: true,
      // },

      // {
      //   name: "Hold USDT_crvUSD collat",
      //   action_type: "LP",
      //   protocol: "Curve",
      //   token_address: "0x390f3595bca2df7d23783dfd126427cceb997bf4", // USDT_crvUSD collat‚
      //   point_rate: 2.0,
      //   unit: "hour",
      //   description: "Stake liquidity provider tokens on stakeDAO",
      //   url: "https://stakedao.org/stake",
      //   is_active: true,
      // },
      // {
      //   name: "Hold USDT_crvUSD LP",
      //   action_type: "LP",
      //   protocol: "Curve",
      //   token_address: CURVE_CONTEXT["USDT_crvUSD"].curveLp, // USDT_crvUSD Address
      //   point_rate: 2.0,
      //   unit: "hour",
      //   description: "Stake liquidity provider tokens on stakeDAO",
      //   url: "https://stakedao.org/stake",
      //   is_active: true,
      // },
      // {
      //   name: "Stake some LP on stakeDAO USDT_crvUSD",
      //   action_type: "LP",
      //   protocol: "stakeDAO",
      //   token_address: CURVE_CONTEXT["USDT_crvUSD"].stakeDaoGauge, // crvUSD-USDC Address
      //   point_rate: 2.0,
      //   unit: "hour",
      //   description: "Stake liquidity provider tokens on stakeDAO",
      //   url: "https://stakedao.org/stake",
      //   is_active: true,
      // },
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
