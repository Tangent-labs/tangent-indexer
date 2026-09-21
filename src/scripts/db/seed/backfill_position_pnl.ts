// Backfills global.position_pnl by replaying PositionPnlService over history in 30 day chunks.
//
// Chunking is not just for memory: each chunk seeds its running balances from the rows the
// previous chunk wrote, through PositionPnlRepository.getCarryIn, so the chunks must run in
// order and oldest first.
//
// Run once the market events, events.checkpoint_ir and global.market_global_data rows of the
// period are indexed, and after backfilling events.reward_paid if reward claims should count.
import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"

import { PositionPnlRepository } from "../../../db/PositionPnlRepository.js"
import { PositionPnlService } from "../../../services/globalData/PositionPnlService.js"
import { DAY_MS } from "../../../utils/date.js"

dotenv.config()

const FROM_DATE = new Date("2026-08-20T00:00:00Z")
const CHUNK_MS = 30 * DAY_MS

async function main() {
  const prisma = new PrismaClient()
  const positionPnlService = new PositionPnlService(new PositionPnlRepository(prisma))

  try {
    const today = new Date()
    console.log(`Computing position_pnl from ${FROM_DATE.toISOString()} to ${today.toISOString()}`)

    let total = 0
    for (let start = FROM_DATE.getTime(); start <= today.getTime(); start += CHUNK_MS) {
      const from = new Date(start)
      const to = new Date(Math.min(start + CHUNK_MS - 1, today.getTime()))

      const rows = await positionPnlService.computePnlForRange(from, to)
      total += rows.length
      console.log(`  ${from.toISOString()} -> ${to.toISOString()}: ${rows.length} row(s)`)
    }

    console.log(`Done, ${total} position row(s) written`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
