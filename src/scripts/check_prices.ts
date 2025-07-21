import { PrismaClient } from "@prisma/client"
import { PriceRepository } from "../db/PriceRepository"
import { PricePointService } from "../services/PricePointService"
import { setUpIndexer } from "config/indexer_setup"

const checkPrices = async () => {
  const { providers } = setUpIndexer()

  const prisma = new PrismaClient()
  const priceService = new PricePointService(new PriceRepository(prisma), providers.at(0)!)
  const prices = await priceService.fetchPriceFeed()
  console.log(prices)
}

checkPrices()
