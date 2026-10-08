// Backfills revenues_token_prices for every day since April 1st 2026, fetching each missing day's
// price from DefiLlama at noon UTC (12h search width) and skipping tokens/days already stored.
import { PrismaClient } from "@prisma/client"
import { RevenuesRepository } from "../../../db/RevenuesRepository.js"
import { defiLLamaFetchPricesHistorical, getPriceInfos } from "../../../services/globalData/DefiLLamaPriceFetcher.js"

const prisma = new PrismaClient()
const revenuesRepository = new RevenuesRepository(prisma)

const DAY_MS = 24 * 60 * 60 * 1000
const SEARCH_WIDTH_HOURS = 12

const START = new Date("2026-04-01T00:00:00Z")

function startOfUTCDay(date: Date) {
  const d = new Date(date.getTime())
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function noonUTC(date: Date) {
  const d = startOfUTCDay(date)
  d.setUTCHours(12, 0, 0, 0)
  return d
}

async function main() {
  const today = startOfUTCDay(new Date())

  const tokens = await revenuesRepository.getRevenuesTokens()
  if (tokens.length === 0) {
    throw new Error("No revenues_tokens found. Run seed_revenues_tokens first.")
  }

  const existingPrices = await revenuesRepository.getRewardTokenPrices(START, today)
  const existingKeys = new Set(existingPrices.map((p) => `${startOfUTCDay(p.day).getTime()}-${p.token_id.toString()}`))

  for (let t = START.getTime(); t <= today.getTime(); t += DAY_MS) {
    const day = new Date(t)
    const missingTokens = tokens.filter((token) => !existingKeys.has(`${day.getTime()}-${token.id.toString()}`))

    if (missingTokens.length === 0) continue

    const timestamp = Math.floor(noonUTC(day).getTime() / 1000)
    const fetchedPrices = await defiLLamaFetchPricesHistorical(
      timestamp,
      missingTokens.map((token) => token.address),
      SEARCH_WIDTH_HOURS
    )

    const newPriceRows = missingTokens.reduce(
      (rows, token) => {
        const priceInfo = getPriceInfos(fetchedPrices, token.address)
        if (priceInfo) {
          rows.push({ day, price: priceInfo.price, token_id: token.id })
        }
        return rows
      },
      [] as { day: Date; price: number; token_id: bigint }[]
    )

    if (newPriceRows.length > 0) {
      await revenuesRepository.saveRewardTokenPrices(newPriceRows)
      console.log(`${day.toISOString().slice(0, 10)}: saved ${newPriceRows.length}/${missingTokens.length} prices`)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
