import { PrismaClient } from "@prisma/client"
import { PriceRepository } from "../db/PriceRepository"
import { PricePointService } from "../services/PricePointService"
import { setUpIndexer } from "config/indexer_setup"
import { MarketContractsRepository } from "db/MarketContractsRepository"

const checkPrices = async () => {
  const { providers } = setUpIndexer()

  const prisma = new PrismaClient()
  const priceService = new PricePointService(new PriceRepository(prisma), new MarketContractsRepository(prisma), providers.at(0)!)
  const prices = await priceService.fetchPriceFeed()
  console.log(prices)
}

checkPrices()
