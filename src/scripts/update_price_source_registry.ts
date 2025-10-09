import { PrismaClient } from "@prisma/client"
import { MarketContractsRepository } from "../db/MarketContractsRepository.js"
import { PriceRepository } from "../db/PriceRepository.js"
import { JsonRpcProvider } from "ethers"
import { PricePointService } from "../services/PricePointService.js"
import { getAddressesJson } from "utils/jsonReader.js"

async function Main() {
  const prismaClient = new PrismaClient()
  const addresses = await getAddressesJson()

  const pricePointService = new PricePointService(
    new PriceRepository(prismaClient),
    new MarketContractsRepository(prismaClient),
    new JsonRpcProvider(process.env.CHAIN_RPCS?.split(",")[0]),
    addresses
  )
  await pricePointService.updateCurvePriceSourceRegistry()
}

Main().then(() => {
  console.log("Done")
  process.exit(0)
})
