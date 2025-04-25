import { PrismaClient } from "@prisma/client"
import { MarketBorrowerRepository } from "db/MarketBorrowerRepository"

import { setUpIndexer } from "config/indexer_setup"
import { LiquidationService } from "services/LiquidationService"
import * as dotenv from "dotenv"
import { LiquidationExecutionContext } from "services/LiquidationExecutionContext"
import { LiquidationBotService } from "services/LiquidationBotLogService"
import { LiquidationBotLogRepository } from "db/LiquidationBotLogRepository"
import NotificationService from "services/NotificationService"
import { CheckLiquidationService } from "services/CheckLiquidationService"

dotenv.config()
const { providers, handleError } = setUpIndexer()
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

  const liquidationBotLogRepository = new LiquidationBotLogRepository(prismaClient)
  const liquidationBotService = new LiquidationBotService(liquidationBotLogRepository)

  const marketBorrowerRepository = new MarketBorrowerRepository(prismaClient)
  const liquidationService = new LiquidationService(marketBorrowerRepository, context, liquidationBotService)

  const notificationService = new NotificationService()

  return {
    liquidationService,
    context,
    liquidationBotService,
    notificationService,
  }
}
