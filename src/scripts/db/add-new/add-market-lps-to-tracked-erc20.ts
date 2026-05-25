import * as dotenv from "dotenv"
import { Prisma, PrismaClient } from "@prisma/client"

dotenv.config()

const prisma = new PrismaClient()

async function main() {
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
