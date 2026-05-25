import * as dotenv from "dotenv"
import { Prisma, PrismaClient } from "@prisma/client"
import { getAddressesJson } from "../../../utils/jsonReader.js"

dotenv.config()

const prisma = new PrismaClient()

const CONFIG_MARKET_TYPES: Record<string, string> = {
  Convex_CRV: "Convex CRV",
  Convex_FXN: "Convex FXN",
  Pendle_PT: "Pendle PT",
  STAKEDAO_CRV_Vault: "StakeDao Vault",
  CRV_Gauge: "Curve Gauge",
}

const BOOTSTRAP_ACTIVE_BORROWERS = [
  {
    marketName: "PYUSD/USDC",
    borrowerAddress: "0x461b62cb3a7e9df8f800ae058ae92f855f2c27ca",
  },
]

function normalizeMarketType(marketType: string): string {
  const normalizedType = CONFIG_MARKET_TYPES[marketType]
  if (!normalizedType) {
    throw new Error(`Unknown configured market type: ${marketType}`)
  }
  return normalizedType
}

async function main() {
  const addresses = await getAddressesJson()
  const existingMarkets = await prisma.usg_markets.findMany({
    select: {
      contract_address: true,
    },
  })
  const existingMarketAddresses = new Set(existingMarkets.map((market) => market.contract_address.toLowerCase()))
  const missingMarkets: Prisma.usg_marketsCreateManyInput[] = addresses.markets
    .filter((market) => !existingMarketAddresses.has(market.marketAddress.toLowerCase()))
    .map((market) => ({
      contract_name: market.marketName,
      collateral_address: market.collatAddress.toLowerCase(),
      contract_address: market.marketAddress.toLowerCase(),
      contract_type: normalizeMarketType(market.marketType),
      is_active: true,
      // addresses.json does not contain deployment metadata for imported markets.
      create_block: 0n,
      create_date: new Date(0),
    }))

  if (missingMarkets.length > 0) {
    const result = await prisma.usg_markets.createMany({
      data: missingMarkets,
      skipDuplicates: true,
    })
    console.log(`Added ${result.count} market(s) to usg_markets (${missingMarkets.length} configured market(s) missing).`)
  } else {
    console.log("No configured market to add to usg_markets.")
  }

  for (const borrower of BOOTSTRAP_ACTIVE_BORROWERS) {
    const configuredMarket = addresses.markets.find((market) => market.marketName === borrower.marketName)
    if (!configuredMarket) {
      throw new Error(`Configured market not found for bootstrap borrower: ${borrower.marketName}`)
    }

    const market = await prisma.usg_markets.findFirst({
      where: {
        contract_address: {
          equals: configuredMarket.marketAddress,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    })
    if (!market) {
      throw new Error(`Market not found in usg_markets after synchronization: ${borrower.marketName}`)
    }

    const borrowerAddress = borrower.borrowerAddress.toLowerCase()
    const existingBorrower = await prisma.active_borrowers.findFirst({
      where: {
        market_id: market.id,
        borrower_address: {
          equals: borrowerAddress,
          mode: "insensitive",
        },
      },
    })

    if (existingBorrower) {
      console.log(`Borrower ${borrowerAddress} is already active on ${borrower.marketName}.`)
      continue
    }

    await prisma.active_borrowers.create({
      data: {
        market_id: market.id,
        borrower_address: borrowerAddress,
        debt_shares: "100000",
      },
    })
    console.log(`Added borrower ${borrowerAddress} to active_borrowers for ${borrower.marketName}.`)
  }

  const markets = await prisma.usg_markets.findMany({
    select: {
      collateral_address: true,
      contract_name: true,
    },
  })

  const marketLpByAddress = new Map<string, Prisma.tracked_erc20CreateManyInput>()

  for (const market of markets) {
    const address = market.collateral_address.toLowerCase()
    marketLpByAddress.set(address, {
      address,
      name: `LP on ${market.contract_name}`,
      symbol: `LP on ${market.contract_name}`,
    })
  }

  const marketLps = Array.from(marketLpByAddress.values())

  if (marketLps.length === 0) {
    console.log("No market LP to add to tracked ERC20.")
    return
  }

  const result = await prisma.tracked_erc20.createMany({
    data: marketLps,
    skipDuplicates: true,
  })

  console.log(`Added ${result.count} market LP(s) to tracked ERC20 (${marketLps.length} market LP(s) found).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
