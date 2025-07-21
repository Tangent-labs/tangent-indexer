import { PrismaClient } from "@prisma/client"
import { CURVE_CONTEXT } from "defi-resources/build/ressources/mappings/curveContext"

const prisma = new PrismaClient()

async function seedTokens() {
  const transferToWatch = [
    {
      address: "0xeef0c605546958c1f899b6fb336c20671f9cd49f",
      name: "crvUSD",
      symbol: "crvUSD",
    },
    {
      address: "0x5f9dc06607e947742ef1b837b952ea0728b1748f",
      name: "USG",
      symbol: "USG",
    },
    {
      address: CURVE_CONTEXT["USDT_crvUSD"].stakeDaoGauge,
      name: "USDT_crvUSD stakeDaoGauge",
      symbol: "USDT_crvUSD",
    },
    {
      address: CURVE_CONTEXT["USDC_crvUSD"].stakeDaoGauge,
      name: "USDC_crvUSD stakeDaoGauge",
      symbol: "USDC_crvUSD",
    },
    {
      address: CURVE_CONTEXT["USDC_crvUSD"].curveLp,
      name: "USDC_crvUSD curveLp",
      symbol: "USDC_crvUSD",
    },
    {
      address: CURVE_CONTEXT["USDe_USDC"].curveLp,
      name: "USDe_USDC curveLp",
      symbol: "USDe_USDC",
    },
    {
      address: CURVE_CONTEXT["USDe_USDC"].curveGauge,
      name: "USDe_USDC gauge",
      symbol: "USDe_USDC",
    },
    {
      address: "0x4DEcE678ceceb27446b35C672dC7d61F30bAD69E",
      name: "some collat",
      symbol: "some collat",
    },
    {
      address: "0x4dece678ceceb27446b35c672dc7d61f30bad69e",
      name: "some collat",
      symbol: "some collat",
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
