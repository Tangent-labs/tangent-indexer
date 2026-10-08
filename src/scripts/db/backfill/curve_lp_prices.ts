// Backfills price_feeds of Curve LPs whose price_source was added late, from the daily LP price
// history of the Curve prices API, so that usg_lp_history can be backfilled for them too.
// Run: npx tsx src/scripts/db/seed/backfill_curve_lp_prices.ts <lpAddress> [<lpAddress> ...]
// The price_source of each LP must already exist. Days already stored are skipped, DRY_RUN=1 prints
// the rows without touching the database.
import * as dotenv from "dotenv"
import axios from "axios"
import { Prisma, PrismaClient } from "@prisma/client"

import { PriceRepository } from "../../../db/Points/PriceRepository.js"

dotenv.config()

const CURVE_PRICES_API = "https://prices.curve.finance/v1"
const FROM_DATE = new Date("2026-04-20T00:00:00Z")
const DRY_RUN = process.env.DRY_RUN === "1"

type CurvePriceHistory = { data: { price: number; timestamp: string }[] }

async function main() {
  const lpAddresses = process.argv.slice(2).map((a) => a.toLowerCase())
  if (lpAddresses.length === 0) {
    throw new Error("Usage: backfill_curve_lp_prices.ts <lpAddress> [<lpAddress> ...]")
  }

  const prisma = new PrismaClient()
  const priceRepository = new PriceRepository(prisma)

  try {
    for (const lpAddress of lpAddresses) {
      const priceSource = await prisma.price_source.findFirst({ where: { address: lpAddress } })
      if (!priceSource) {
        throw new Error(`No price_source for ${lpAddress}, add it first`)
      }

      const { data } = await axios.get<CurvePriceHistory>(`${CURVE_PRICES_API}/usd_price/ethereum/${lpAddress}/history`, {
        params: { interval: "day", start: Math.floor(FROM_DATE.getTime() / 1000), end: Math.floor(Date.now() / 1000) },
      })

      const existing = await prisma.price_feeds.findMany({ where: { price_source_id: priceSource.id }, select: { timestamp: true } })
      const existingTimestamps = new Set(existing.map((feed) => feed.timestamp.getTime()))

      // Curve returns UTC timestamps without the zone suffix
      const rows: Prisma.price_feedsCreateManyInput[] = data.data
        .map((point) => ({ timestamp: new Date(`${point.timestamp}Z`), price_usd: point.price.toFixed(4), price_source_id: priceSource.id }))
        .filter((row) => !existingTimestamps.has(row.timestamp.getTime()))

      console.log(`${priceSource.name}: ${data.data.length} Curve daily prices since ${data.data[0]?.timestamp}, ${rows.length} to insert`)
      if (!DRY_RUN) {
        await priceRepository.insertPriceFeed(rows)
      }
    }

    if (DRY_RUN) {
      console.log("DRY_RUN, nothing written")
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
