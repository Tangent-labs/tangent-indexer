import { PrismaClient } from "@prisma/client"
import fetch from "node-fetch"

import { PriceRepository } from "../db/PriceRepository.js"
import { PricePointService } from "../services/PricePointService.js"
import { setUpIndexer } from "../config/indexer_setup.js"
import { MarketContractsRepository } from "../db/MarketContractsRepository.js"
import { AddressesJson } from "type/data.js"

const checkPrices = async () => {
  const { providers } = setUpIndexer()

  const prisma = new PrismaClient()
  const addresses = (await (await fetch("https://raw.githubusercontent.com/Tangent-labs/public-files/main/addresses.json")).json()) as AddressesJson
  const priceService = new PricePointService(new PriceRepository(prisma), new MarketContractsRepository(prisma), providers.at(0)!, addresses)
  const result = await priceService.fetchPriceFeed()

  if (result.warnings.length > 0) {
    console.log("Warnings:", result.warnings)
  }
}

checkPrices()
