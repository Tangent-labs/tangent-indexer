import { PrismaClient } from "@prisma/client"
import { AddressesJson } from "../../../type/data.js"

const prisma = new PrismaClient()

const START_ISO = process.argv[3] ?? "2024-06-01"
const DAYS = Number(process.argv[4] ?? "720")

const SEED = Number(process.argv[5] ?? "1337")
const MAX_DAILY_CHANGE_TOKENS = BigInt(process.argv[6] ?? "20000")

const DECIMALS = 18n
const ONE = 10n ** DECIMALS

const BASE_SUPPLY = 1_000_000_000n * ONE

function mulberry32(seed: number) {
  let t = seed >>> 0
  return function () {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function addDaysUTC(d: Date, days: number) {
  const nd = new Date(d.getTime())
  nd.setUTCDate(nd.getUTCDate() + days)
  return nd
}

export async function seedTotalSupply(addresses: AddressesJson) {
  const start = new Date(`${START_ISO}T00:00:00Z`)
  if (isNaN(start.getTime())) {
    throw new Error(`Invalid start date "${START_ISO}". Use YYYY-MM-DD.`)
  }

  const USG = await prisma.tracked_erc20.findUnique({
    where: {
      address: addresses.tokens.USG.toLowerCase(),
    },
    select: {
      id: true,
    },
  })

  const sUSG = await prisma.tracked_erc20.findUnique({
    where: {
      address: addresses.tokens.sUSG.toLowerCase(),
    },
    select: {
      id: true,
    },
  })

  const tokenIds = [USG?.id, sUSG?.id] as const

  const allRows: {
    token_id: bigint
    timestamp: Date
    total_supply: string
  }[] = []

  for (let t = 0; t < tokenIds.length; t++) {
    const tokenId = tokenIds[t]

    const rand = mulberry32(SEED + t)

    let supply = BASE_SUPPLY

    let lastWeekTarget = BASE_SUPPLY

    for (let i = 0; i < DAYS; i++) {
      const ts = addDaysUTC(start, i)

      const sign = rand() < 0.5 ? -1n : 1n
      const magTokens = BigInt(Math.floor(rand() * Number(MAX_DAILY_CHANGE_TOKENS + 1n)))
      const delta = sign * magTokens * ONE

      let next = supply + delta
      if (next < 0n) next = 0n

      const isEndOfWeek = (i + 1) % 7 === 0
      if (isEndOfWeek) {
        const target = (lastWeekTarget * 110n) / 100n
        next = target
        lastWeekTarget = target
      }

      supply = next

      allRows.push({
        token_id: tokenId as bigint,
        timestamp: ts,
        total_supply: supply.toString(),
      })
    }
  }

  await prisma.total_supplies.createMany({
    data: allRows,
    skipDuplicates: true,
  })

  await prisma.$disconnect()
}
