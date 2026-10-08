// Backfills daily_volumes and daily_volumes_market since April 1st 2026 by running
// VolumeService.computeVolumesForRange, which values the market collateral flows with the
// average oracle price of each day and the debt flows with USG at $1.
// Run once the market events and market_global_data rows of the period are indexed.
import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"

import { VolumeRepository } from "../../../db/VolumeRepository.js"
import { VolumeService } from "../../../services/globalData/VolumeService.js"

dotenv.config()

const FROM_DATE = new Date("2026-08-20T00:00:00Z")

async function main() {
  const prisma = new PrismaClient()
  const volumeRepository = new VolumeRepository(prisma)
  const volumeService = new VolumeService(volumeRepository)

  try {
    const today = new Date()
    console.log(`Computing daily_volumes from ${FROM_DATE.toISOString()} to ${today.toISOString()}`)
    await volumeService.computeVolumesForRange(FROM_DATE, today)
    console.log("Done")
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
