import { PrismaClient } from "@prisma/client"
import { MarketBorrowerRepository } from "db/MarketBorrowerRepository"

import { setUpIndexer } from "config/indexer_setup"
import { LiquidationService } from "services/LiquidationService"
import * as dotenv from "dotenv"
import { LiquidationExecutionContext } from "services/LiquidationExecutionContext"
import { LiquidationBotService } from "services/LiquidationBotLogService"
import { LiquidationBotLogRepository } from "db/LiquidationBotLogRepository"
import { LiquidationBotLogAction } from "type/data"

dotenv.config()
const { provider, handleError } = setUpIndexer()
const { liquidationService, context, liquidationBotService } = setUpCheckLiquidationServices()

export async function checkLiquidationRun(
  testLiquidationService?: LiquidationService,
  testContext?: LiquidationExecutionContext,
  testLiquidationBotService?: LiquidationBotService
) {
  const currentLiquidationService = testLiquidationService || liquidationService
  const currentContext = testContext || context
  const currentLiquidationBotService = testLiquidationBotService || liquidationBotService

  //  Adapt the params accordlingly to the connectivity
  await currentLiquidationService.checkContext()

  // keep track of the current action in case of an error
  let currentAction: LiquidationBotLogAction = "liquidation_params"
  try {
    // Get the parameters
    const { markets, borrowers } = await currentLiquidationService.getLiquidationParams()
    await currentLiquidationBotService.logLiquidationParams({ markets, borrowers }, currentContext)
    if (!borrowers.length) {
      // TODO
      return
    }
    if (currentContext.isDbAlive) {
      currentLiquidationService.saveFiles({ markets, borrowers })
    }
    currentAction = "on_chain_data"
    // Get the data
    const onChainData = await currentLiquidationService.getOnchainData(provider, markets, borrowers)
    await currentLiquidationBotService.logOnchainData(onChainData || null, currentContext)
    if (!onChainData) {
      // TODO
      return
    }
    currentAction = "liquidation_analysis"
    // Analysis
    const { hardLiquidationList, softLiquidationList, notDebtorAnymoreList } = await currentLiquidationService.analyzeLiquidation(onChainData, borrowers)
    await currentLiquidationBotService.logLiquidationAnalysis(onChainData || null, currentContext)

    // Actions
    if (hardLiquidationList && hardLiquidationList.length > 0) {
      currentAction = "liquidation_bad_debt_execution"
      await currentLiquidationService.processHardLiquidations(provider, hardLiquidationList)
    }
    if (softLiquidationList && softLiquidationList.length > 0) {
      currentAction = "liquidation_execution"
      await currentLiquidationService.processSoftLiquidations(provider, softLiquidationList)
    }
    if (notDebtorAnymoreList && notDebtorAnymoreList.length > 0) {
      currentAction = "clean_debtors"
      await currentLiquidationService.processCleanDebtors(notDebtorAnymoreList)
      await currentLiquidationBotService.logCleanDebtors(notDebtorAnymoreList || null, currentContext)
    }
  } catch (e) {
    await currentLiquidationBotService.logError(currentAction, e as Error, currentContext)
    handleError(e as Error)
  }
}

// Run main function if this file is being run directly
if (process.env.NODE_ENV !== "test") {
  checkLiquidationRun().then(() => console.log("Done"))
}

export function setUpCheckLiquidationServices() {
  const prismaClient = new PrismaClient()

  const context = new LiquidationExecutionContext()

  const liquidationBotLogRepository = new LiquidationBotLogRepository(prismaClient)
  const liquidationBotService = new LiquidationBotService(liquidationBotLogRepository)

  const marketBorrowerRepository = new MarketBorrowerRepository(prismaClient)
  const liquidationService = new LiquidationService(marketBorrowerRepository, context, liquidationBotService)

  return {
    liquidationService,
    context,
    liquidationBotService,
  }
}
