import { PrismaClient } from "@prisma/client"
import { MarketContractsRepository } from "db/MarketContractsRepository"
import { PriceRepository } from "db/PriceRepository"
import { JsonRpcProvider } from "ethers"
import { PricePointService } from "services/PricePointService"

async function Main() {
  const prismaClient = new PrismaClient()
  const pricePointService = new PricePointService(
    new PriceRepository(prismaClient),
    new MarketContractsRepository(prismaClient),
    new JsonRpcProvider(process.env.CHAIN_RPCS?.split(",")[0])
  )
  await pricePointService.updateCurvePriceSourceRegistry()
}

Main().then(() => {
  console.log("Done")
  process.exit(0)
})
