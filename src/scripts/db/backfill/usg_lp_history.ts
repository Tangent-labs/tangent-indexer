// Backfills usg_lp_history with one point per day at 00:00 UTC since April 20th 2026: the LP total
// supply read at the closest block before midnight (archive RPC needed), valued with the last LP
// price feed of that moment. The live points are written by indexer-global-data.
// Points already backfilled for a day are replaced, so the script can be rerun. DRY_RUN=1 prints
// the rows without touching the database.
import * as dotenv from "dotenv"
import { Prisma, PrismaClient } from "@prisma/client"
import { JsonRpcProvider } from "ethers"

import { LiquidityRepository } from "../../../db/LiquidityRepository.js"
import { LiquidityService } from "../../../services/globalData/LiquidityService.js"
import { DAY_MS, startOfUTCDay } from "../../../utils/date.js"
import { getBlockByTimestamp } from "../../../utils/etherscan.js"

dotenv.config()

const FROM_DATE = new Date("2026-04-20T00:00:00Z")
const DRY_RUN = process.env.DRY_RUN === "1"

async function main() {
  const prisma = new PrismaClient()
  const provider = new JsonRpcProvider(process.env.CHAIN_RPCS!.split(",")[0])
  const liquidityService = new LiquidityService(new LiquidityRepository(prisma))
  console.log(DRY_RUN)
  try {
    const days: Date[] = []
    for (let day = FROM_DATE.getTime(); day <= startOfUTCDay(new Date()).getTime(); day += DAY_MS) {
      days.push(new Date(day))
    }

    const rows: Prisma.usg_lp_historyCreateManyInput[] = []
    for (const day of days) {
      const block = await getBlockByTimestamp(day.getTime() / 1000, "before")
      const dayRows = await liquidityService.buildLpLiquidityRows(provider, day, block)
      dayRows.forEach((row) => console.log(`${day.toISOString().slice(0, 10)} lp ${row.usg_lp_id}: $${Math.round(row.liquidity_usd)}`))
      rows.push(...dayRows)
    }

    if (DRY_RUN) {
      console.log(`DRY_RUN, nothing written. Would insert ${rows.length} usg_lp_history rows`)
      return
    }

    await prisma.$transaction([prisma.usg_lp_history.deleteMany({ where: { date: { in: days } } }), prisma.usg_lp_history.createMany({ data: rows })])
    console.log(`Inserted ${rows.length} usg_lp_history rows over ${days.length} days`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
