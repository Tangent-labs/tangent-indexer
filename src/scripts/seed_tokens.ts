import { PrismaClient } from "@prisma/client"
import { CURVE_CONTEXT } from "defi-resources/build/ressources/mappings/curveContext"

const prisma = new PrismaClient()

async function seedTokens() {
  const transferToWatch = [
    {
      address: "0xf0014CBe67b3aB638bdaA2e2Cb1B531935829E50".toLowerCase(),
      name: "USG",
      symbol: "USG",
    },
    {
      address: CURVE_CONTEXT.USDT_crvUSD.stakeDaoGauge.toLowerCase(),
      name: "USDT_crvUSD stakeDaoGauge",
      symbol: "USDT_crvUSD",
    },
    {
      address: CURVE_CONTEXT.USDT_crvUSD.curveLp.toLowerCase(),
      name: "USDT_crvUSD curveLp",
      symbol: "USDT_crvUSD",
    },
    {
      address: CURVE_CONTEXT.USDC_crvUSD.stakeDaoGauge.toLowerCase(),
      name: "USDC_crvUSD stakeDaoGauge",
      symbol: "USDC_crvUSD",
    },
    {
      address: CURVE_CONTEXT.USDC_crvUSD.curveLp.toLowerCase(),
      name: "USDC_crvUSD curveLp",
      symbol: "USDC_crvUSD",
    },
    {
      address: CURVE_CONTEXT.USDe_USDC.curveLp.toLowerCase(),
      name: "USDe_USDC curveLp",
      symbol: "USDe_USDC",
    },
    {
      address: CURVE_CONTEXT.USDe_USDC.curveGauge.toLowerCase(),
      name: "USDe_USDC gauge",
      symbol: "USDe_USDC",
    },
  ]

  for (const token of transferToWatch) {
    await prisma.tracked_erc20.upsert({
      where: { address: token.address },
      update: {},
      create: token,
    })
  }
  console.log("Tokens seeded successfully!")
}

seedTokens()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
