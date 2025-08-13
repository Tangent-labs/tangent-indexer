import { PrismaClient } from "@prisma/client"
import { CURVE_CONTEXT } from "defi-resources/build/ressources/mappings/curveContext"

const prisma = new PrismaClient()

async function seedPriceFeeds() {
  const tokens = [
    {
      address: "0xdf422894281A27Aa3d19B0B7D578c59Cb051ABF8".toLowerCase(),
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

  const currentTimestamp = 1754990730 // 12 Aout 2025
  const oneDaySeconds = 24 * 60 * 60
  const oneMontAgo = currentTimestamp - 30 * oneDaySeconds

  for (const token of tokens) {
    // Ensure token exists in tracked_erc20 table
    await prisma.tracked_erc20.upsert({
      where: { address: token.address },
      update: {},
      create: token,
    })

    // Generate price feeds for each day
    for (let ts = oneMontAgo; ts <= currentTimestamp; ts += oneDaySeconds) {
      // Generate random price between 0.95 and 1.05 USD (assuming stablecoin-like tokens)
      const priceUsd = Math.floor((0.95 + Math.random() * 0.1) * 1000000000000000000) // Store as integer (micro-USD)

      await prisma.price_feeds.create({
        data: {
          token: token.address,
          timestamp: new Date(ts * 1000),
          price_usd: priceUsd.toString(),
        },
      })
    }
  }

  console.log("Price feeds seeded successfully!")
}

seedPriceFeeds()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
