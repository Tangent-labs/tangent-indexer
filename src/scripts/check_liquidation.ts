import { PrismaClient } from "@prisma/client"
import { ActiveBorrowersRepository } from "../db/ActiveBorrowersRepository"

import { setUpIndexer } from "config/indexer_setup"
import { LiquidationService } from "services/LiquidationService"
import * as dotenv from "dotenv"
import { LiquidationExecutionContext } from "services/LiquidationExecutionContext"
import { LiquidationBotService } from "services/LiquidationBotLogService"
import { LiquidationBotLogRepository } from "db/LiquidationBotLogRepository"
import NotificationService from "services/NotificationService"
import { CheckLiquidationService } from "services/CheckLiquidationService"
import { indexerConfig } from "config/indexer_config"

dotenv.config()
const { providers, walletsPks, handleError } = setUpIndexer()
const { liquidationService, context, liquidationBotService, notificationService } = setUpCheckLiquidationServices()

// Run main function if this file is being run directly
if (process.env.NODE_ENV !== "test") {
  const checkLiquidationService = new CheckLiquidationService(liquidationService, context, liquidationBotService, notificationService, providers)
  checkLiquidationService
    .run()
    .then(() => console.log("Done"))
    .catch(handleError)
}

export function setUpCheckLiquidationServices() {
  const prismaClient = new PrismaClient()

  const context = new LiquidationExecutionContext()
  context.providers = providers
  context.walletsPks = walletsPks

  const liquidationBotLogRepository = new LiquidationBotLogRepository(prismaClient)
  const liquidationBotService = new LiquidationBotService(liquidationBotLogRepository)

  const activeBorrowersRepository = new ActiveBorrowersRepository(prismaClient)
  const liquidationService = new LiquidationService(activeBorrowersRepository, context, liquidationBotService)
  liquidationService.minEthBalance = indexerConfig.minEthBalance
  liquidationService.curveRouterAddress = indexerConfig.contracts.curveRouterAddress
  const notificationService = new NotificationService()

  return {
    liquidationService,
    context,
    liquidationBotService,
    notificationService,
  }
}
