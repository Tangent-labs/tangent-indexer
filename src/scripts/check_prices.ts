import { PrismaClient } from "@prisma/client"
import { PriceRepository } from "../db/PriceRepository.js"
import { PricePointService } from "../services/PricePointService.js"
import { setUpIndexer } from "../config/indexer_setup.js"
import { MarketContractsRepository } from "../db/MarketContractsRepository.js"
import { AddressesJson, readJsonFile } from "utils/readGDrive.js"

const checkPrices = async () => {
  const { providers } = setUpIndexer()

  const prisma = new PrismaClient()
  const addresses = await readJsonFile<AddressesJson>(process.env.GOOGLE_ADDRESSES_FILE_ID!.toString())
  const priceService = new PricePointService(new PriceRepository(prisma), new MarketContractsRepository(prisma), providers.at(0)!, addresses)
  const result = await priceService.fetchPriceFeed()

  if (result.warnings.length > 0) {
    console.log("Warnings:", result.warnings)
  }
}

checkPrices()
