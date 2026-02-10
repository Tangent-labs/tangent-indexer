import { PrismaClient } from "@prisma/client"

import { getAddressesJson } from "../../../utils/jsonReader.js"

const prisma = new PrismaClient()

async function seed() {
  const addresses = await getAddressesJson()
  const sTAN = addresses.tokens.sTAN
  const sUSG = addresses.tokens.sUSG

  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000

  // Build recent events (within the last 7 days)
  let blockBase = Math.floor(Date.now() / 1000)

  const events: {
    token: string
    gain: string
    currentDebtAfter: string
    block_date: Date
    block_id: number
    tx_hash: string
  }[] = []

  const perToken: Record<string, number[]> = {
    [sTAN]: [1.0, 2.0, 0.5], // ETH units for readability
    [sUSG]: [0.25, 0.15],
  }

  for (const token of Object.keys(perToken)) {
    const amounts = perToken[token]
    for (let i = 0; i < amounts.length; i++) {
      const when = new Date(now.getTime() - (i + 1) * dayMs)
      events.push({
        token,
        gain: BigInt(Math.round(amounts[i] * 1e18)).toString(),
        currentDebtAfter: BigInt(0).toString(),
        block_date: when,
        block_id: ++blockBase,
        tx_hash: `0xseed_${token}_${when.getTime()}_${i}`,
      })
    }
  }

  console.log(`Seeding ${events.length} process_report events for sTAN and sUSG...`)
  await prisma.process_report.createMany({ data: events })
  console.log("✅ Done.")
}

seed()
  .catch((e) => {
    console.error("❌ Seeding failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
