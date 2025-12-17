// seed-indicator.ts
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function seedIndicator({
  key,
  daysBack = 730, // ~2 years of daily data
  minValue = 1.0,
  maxValue = 10.0,
}: {
  key: string
  daysBack?: number
  minValue?: number
  maxValue?: number
}) {
  const indicator = await prisma.global_indicators.findFirst({
    where: { key },
    select: { id: true },
  })

  if (!indicator) {
    throw new Error(`Indicator with key "${key}" not found! Create it first.`)
  }

  console.log(`Seeding ${daysBack} daily points for indicator "${key}" (id: ${indicator.id})...`)

  const valuesToInsert = []

  for (let i = daysBack; i >= 0; i--) {
    const date = new Date()
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCDate(date.getUTCDate() - i)

    // Random float between min and max (2 decimal places like real APYs)
    const value = parseFloat((Math.random() * (maxValue - minValue) + minValue).toFixed(4))

    valuesToInsert.push({
      timestamp: date,
      value,
      global_indicator_id: indicator.id,
    })
  }

  // Bulk insert (super fast)
  await prisma.global_indicators_values.createMany({
    data: valuesToInsert,
    skipDuplicates: true, // safe if you run it twice
  })

  console.log(`Successfully seeded ${valuesToInsert.length} daily points!`)
}

async function main() {
  try {
    await seedIndicator({
      key: "SAVING_APY_USG",
      daysBack: 730, // 2 years
      minValue: 1.0,
      maxValue: 10.0,
    })
  } catch (error) {
    console.error("Error:", error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
