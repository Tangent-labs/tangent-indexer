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

async function main() {
  //  Adapt the params accordlingly to the connectivity
  await liquidationService.checkContext()

  // keep track of the current action in case of an error
  let currentAction: LiquidationBotLogAction = "liquidation_params"
  try {
    // Get the parameters
    const { markets, borrowers } = await liquidationService.getLiquidationParams()
    await liquidationBotService.logLiquidationParams({ markets, borrowers }, context)
    if (!borrowers.length) {
      // TODO
      return
    }
    if (context.isDbAlive) {
      liquidationService.saveFiles({ markets, borrowers })
    }
    currentAction = "on_chain_data"
    // Get the data
    const onChainData = await liquidationService.getOnchainData(provider, markets, borrowers)
    await liquidationBotService.logOnchainData(onChainData || null, context)
    if (!onChainData) {
      // TODO
      return
    }
    currentAction = "liquidation_analysis"
    // Analysis
    const { hardLiquidationList, softLiquidationList, notDebtorAnymoreList } = await liquidationService.analyzeLiquidation(onChainData, borrowers)
    await liquidationBotService.logLiquidationAnalysis(onChainData || null, context)

    // Actions
    if (hardLiquidationList && hardLiquidationList.length > 0) {
      currentAction = "liquidation_bad_debt_execution"
      await liquidationService.processHardLiquidations(provider, hardLiquidationList)
      await liquidationBotService.logLiquidationBadDebtExecution(hardLiquidationList[0] || null, context)
    }
    if (softLiquidationList && softLiquidationList.length > 0) {
      currentAction = "liquidation_execution"
      await liquidationService.processSoftLiquidations(provider, softLiquidationList)
      await liquidationBotService.logLiquidationExecution(softLiquidationList[0] || null, context)
    }
    if (notDebtorAnymoreList && notDebtorAnymoreList.length > 0) {
      currentAction = "clean_debtors"
      await liquidationService.processCleanDebtors(notDebtorAnymoreList)
      await liquidationBotService.logCleanDebtors(notDebtorAnymoreList || null, context)
    }
  } catch (e) {
    await liquidationBotService.logError(currentAction, e as Error, context)
    handleError(e as Error)
  }
}
main().then(() => console.log("Done"))

function setUpCheckLiquidationServices() {
  const prismaClient = new PrismaClient()

  const context = new LiquidationExecutionContext()

  const marketBorrowerRepository = new MarketBorrowerRepository(prismaClient)
  const liquidationService = new LiquidationService(marketBorrowerRepository, context)

  const liquidationBotLogRepository = new LiquidationBotLogRepository(prismaClient)
  const liquidationBotService = new LiquidationBotService(liquidationBotLogRepository)

  return {
    liquidationService,
    context,
    liquidationBotService,
  }
}
