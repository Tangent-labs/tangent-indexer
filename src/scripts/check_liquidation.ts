import { PrismaClient } from "@prisma/client"
import { MarketBorrowerRepository } from "db/MarketBorrowerRepository"

import { setUpIndexer } from "config/indexer_setup"
import { LiquidationService } from "services/LiquidationService"

const { provider, handleError } = setUpIndexer()
const { liquidationService } = setUpCheckLiquidationServices()

async function main() {
  try {
    // Get the parameters
    const { markets, borrowers } = await liquidationService.getLiquidationParams()
    if (!borrowers.length) {
      // TODO
      return
    }

    // Get the data
    const onChainData = await liquidationService.getOnchainData(provider, markets, borrowers)
    if (!onChainData) {
      // TODO
      return
    }

    // Analysis
    const { hardLiquidationList, softLiquidationList, notDebtorAnymoreList } = await liquidationService.analyzeLiquidation(onChainData, markets, borrowers)

    // Actions
    if (hardLiquidationList && hardLiquidationList.length > 0) {
      await liquidationService.processHardLiquidations(provider, hardLiquidationList)
    }
    if (softLiquidationList && softLiquidationList.length > 0) {
      await liquidationService.processSoftLiquidations(provider, softLiquidationList)
    }
    if (notDebtorAnymoreList && notDebtorAnymoreList.length > 0) {
      await liquidationService.processCleanDebtors(notDebtorAnymoreList)
    }
  } catch (e) {
    console.log(e)
    handleError(e as Error)
  }
}
main().then(() => console.log("Done"))

function setUpCheckLiquidationServices() {
  const prismaClient = new PrismaClient()
  // Setup the repositories
  const marketBorrowerRepository = new MarketBorrowerRepository(prismaClient)
  // set up the services
  const liquidationService = new LiquidationService(marketBorrowerRepository)

  return {
    liquidationService,
  }
}
