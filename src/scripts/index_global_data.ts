import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"
import { JsonRpcProvider } from "ethers"

import { MarketGlobalDataRepository } from "../db/MarketGlobalDataRepository.js"
import { TotalSupplyRepository } from "../db/TotalSupplyRepository.js"

import { GlobalMarketDataService } from "../services/globalData/GlobalMarketDataService.js"
import { PriceApiService } from "../services/PriceApiService.js"
dotenv.config()

const prismaClient = new PrismaClient()
const chainRpcs = process.env.CHAIN_RPCS
if (!chainRpcs) {
  throw new Error("CHAIN_RPCS_NOT_SET")
}
const provider = new JsonRpcProvider(chainRpcs.split(",")[0])

const NEW_ROWS_FREQUENCY = 900_000

async function main() {
  const priceApiService = new PriceApiService()
  const globalDataService = new GlobalMarketDataService(prismaClient, provider, priceApiService)
  const marketGlobalDataRepo = new MarketGlobalDataRepository(prismaClient)
  const totalSupplyRepo = new TotalSupplyRepository(prismaClient)

  const { marketsData, totalSupplies, now } = await globalDataService.computeAndStoreAprTvlsAndTotalSupplies()
  const lastUpdateTimeMarkets = await marketGlobalDataRepo.fetchLastExecutionTime()
  const lastUpdateTimeTotalSupplies = await totalSupplyRepo.fetchLastExecutionTime()

  if (lastUpdateTimeMarkets && lastUpdateTimeMarkets.getTime() + NEW_ROWS_FREQUENCY > now.getTime()) {
    await marketGlobalDataRepo.updateRows(marketsData, lastUpdateTimeMarkets)
  } else {
    await marketGlobalDataRepo.insertRows(marketsData)
  }

  if (lastUpdateTimeTotalSupplies && lastUpdateTimeTotalSupplies.getTime() + NEW_ROWS_FREQUENCY > now.getTime()) {
    await totalSupplyRepo.updateRows(totalSupplies, lastUpdateTimeTotalSupplies)
  } else {
    await totalSupplyRepo.insertRows(totalSupplies)
  }
}

main().then()
