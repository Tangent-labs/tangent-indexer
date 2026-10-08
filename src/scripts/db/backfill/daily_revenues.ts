// Backfills daily_revenues since April 1st 2026 by running RevenuesService.computeRevenuesForRange,
// which combines checkpoint_ir interest and priced reward_notified cuts into a per-day USD amount.
// Run after backfill_revenues_events.ts and backfill_reward_token_prices.ts so the underlying data exists.
import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"

import { RevenuesRepository } from "../../../db/RevenuesRepository.js"
import { RevenuesService } from "../../../services/globalData/RevenuesService.js"

dotenv.config()

const FROM_DATE = new Date("2026-04-01T00:00:00Z")

async function main() {
  const prisma = new PrismaClient()
  const revenuesRepository = new RevenuesRepository(prisma)
  const revenuesService = new RevenuesService(revenuesRepository)

  try {
    const today = new Date()
    console.log(`Computing daily_revenues from ${FROM_DATE.toISOString()} to ${today.toISOString()}`)
    await revenuesService.computeRevenuesForRange(FROM_DATE, today)
    console.log("Done")
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
