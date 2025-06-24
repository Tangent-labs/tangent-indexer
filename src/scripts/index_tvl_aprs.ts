import { PrismaClient } from "@prisma/client"
import { MarketGlobalDataRepository } from "db/MarketGlobalDataRepository"
import * as dotenv from "dotenv"
import { JsonRpcProvider } from "ethers"

import { TVLAprMarketService } from "services/tvlAprs/TVLAprMarketService"
dotenv.config()

const prismaClient = new PrismaClient()
const chainRpcs = process.env.CHAIN_RPCS
if (!chainRpcs) {
  throw new Error("CHAIN_RPCS_NOT_SET")
}
const provider = new JsonRpcProvider(chainRpcs.split(",")[0])

const NEW_ROWS_FREQUENCY = 900_000

async function main() {
  const tvlAprMarketService = new TVLAprMarketService(prismaClient, provider)
  const marketGlobalDataRepo = new MarketGlobalDataRepository(prismaClient)

  const data = await tvlAprMarketService.fetchAndFormatData()
  const lastUpdate = await marketGlobalDataRepo.fetchLastExecutionTime()

  if (lastUpdate && lastUpdate.getTime() + NEW_ROWS_FREQUENCY > new Date().getTime()) {
    await marketGlobalDataRepo.updateRows(data, lastUpdate)
  } else {
    await marketGlobalDataRepo.insertRows(data)
  }
}

main().then()
