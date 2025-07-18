import { PrismaClient } from "@prisma/client"
import { CURVE_CONTEXT } from "defi-resources/build/ressources/mappings/curveContext"

const prisma = new PrismaClient()

async function seedTokens() {
  const transferToWatch = [
    {
      address: "0xa5100dFD6C966aC60a8E497a3545B49B12Dd45BC",
      name: "USG",
      symbol: "USG",
    },
    {
      address: CURVE_CONTEXT["USDe_USDC"].curveLp,
      name: "USDe_USDC collat",
      symbol: "USDe_USDC",
    },
    {
      address: CURVE_CONTEXT["USDe_USDC"].curveGauge,
      name: "USDe_USDC gauge",
      symbol: "USDe_USDC",
    },
    {
      address: "0x390f3595bCa2Df7d23783dFd126427CCeb997BF4",
      name: "crvUSD-USDT collat",
      symbol: "crvUSD-USDT",
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
