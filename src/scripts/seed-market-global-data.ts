import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const START_DATE = new Date("2025-01-01T00:00:00.000Z")
const END_DATE = new Date("2025-08-06T00:00:00.000Z")

// Market IDs from 376 to 390
const MARKET_IDS = Array.from({ length: 15 }, (_, i) => BigInt(1156 + i))

function generateRandomFloat(min: number, max: number): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2))
}

async function seed() {
  const DAY_IN_MS = 24 * 60 * 60 * 1000
  let count = 0

  console.log(`⏳ Seeding data from ${START_DATE.toISOString()} to ${END_DATE.toISOString()}`)
  for (let time = START_DATE.getTime(); time <= END_DATE.getTime(); time += DAY_IN_MS) {
    const timestamp = new Date(time)

    for (const marketId of MARKET_IDS) {
      const totalDebt = generateRandomFloat(1_000_000, 2_000_000)
      const tvlUsd = totalDebt + generateRandomFloat(50_000, 500_000)
      const tvlAmount = tvlUsd / generateRandomFloat(0.5, 2)
      const badDebt = totalDebt * generateRandomFloat(0, 0.05)
      const aprProjected = JSON.stringify({ borrow: generateRandomFloat(1, 10) })
      const aprCurrent = JSON.stringify({ borrow: generateRandomFloat(1, 10) })
      const oraclePrice = generateRandomFloat(0.5, 2)
      const irApy = generateRandomFloat(1, 15)
      const rewardCut = generateRandomFloat(0, 0.1)

      await prisma.market_global_data.create({
        data: {
          market_id: marketId,
          timestamp,
          apr_projected: aprProjected,
          apr_current: aprCurrent,
          tvl_usd: tvlUsd,
          tvl_amount: tvlAmount,
          total_debt: totalDebt,
          bad_debt: badDebt,
          oracle_price: oraclePrice,
          ir_apy: irApy,
          reward_cut: rewardCut,
        },
      })

      count++
    }
  }

  console.log(`✅ Done seeding ${count} rows.`)
  await prisma.$disconnect()
}

seed().catch((e) => {
  console.error("❌ Seeding failed:", e)
  prisma.$disconnect()
  process.exit(1)
})
