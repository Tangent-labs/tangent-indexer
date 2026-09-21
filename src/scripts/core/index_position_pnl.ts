// Samples the equity and PnL of every lending position into global.position_pnl.
// Meant to run on a 6 hour cron, matching the bucket size. Each run recomputes the currently
// open bucket and closes the previous one, so a missed run is caught up by the next.
//
// Deliberately not part of index_global_data: that loop runs every few seconds, and rewriting a
// row per open position on every pass would be pure waste.
import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"

import { PositionPnlRepository } from "../../db/PositionPnlRepository.js"
import { PositionPnlService } from "../../services/globalData/PositionPnlService.js"
import { BUCKET_MS } from "../../utils/date.js"

dotenv.config()

async function main() {
  const prisma = new PrismaClient()
  const positionPnlService = new PositionPnlService(new PositionPnlRepository(prisma))

  try {
    const now = new Date()
    // One bucket back so the bucket that just closed is finalised alongside the open one
    const from = new Date(now.getTime() - BUCKET_MS)
    console.log(`Computing position_pnl from ${from.toISOString()} to ${now.toISOString()}`)

    const rows = await positionPnlService.computePnlForRange(from, now)
    console.log(`Done, ${rows.length} position row(s) written`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
