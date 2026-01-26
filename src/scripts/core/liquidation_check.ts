import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"

import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository.js"
import { LiquidationBotLogRepository } from "../../db/LiquidationBotLogRepository.js"

import { LiquidationService } from "../../services/LiquidationService.js"
import { LiquidationBotLogService } from "../../services/LiquidationBotLogService.js"
import { CheckLiquidationService } from "../../services/LiquidationCheckService.js"

import { indexerConfig } from "../../config/indexer_config.js"
import { LiquidationExecutionContext } from "../../services/LiquidationExecutionContext.js"
import { setUpIndexer } from "../../config/indexer_setup.js"
import { TelegramNotifierService } from "../../services/TelegramNotificationServices.js"
import { routers } from "@tangent/defi-resources"

dotenv.config()
const { providers, walletsPks, handleError } = setUpIndexer()
const { liquidationService, context, liquidationBotService, telegramNotifierService, prismaClient } = setUpCheckLiquidationServices()

// Run main function if this file is being run directly
if (process.env.NODE_ENV !== "test") {
  const checkLiquidationService = new CheckLiquidationService(liquidationService, context, liquidationBotService, telegramNotifierService, providers)
  let exitCode = 0

  checkLiquidationService
    .run()
    .then(() => {
      console.log("Done")
      // Queue is already closed in the run() method's finally block
    })
    .catch((error) => {
      handleError(error)
      exitCode = 1
      // Ensure queue is closed even on error
      return checkLiquidationService.close().catch(() => {
        // Ignore errors when closing queue
      })
    })
    .finally(async () => {
      // Close Prisma connection
      await prismaClient.$disconnect()
      process.exit(exitCode)
    })
}

export function setUpCheckLiquidationServices() {
  const prismaClient = new PrismaClient()

  const context = new LiquidationExecutionContext()
  context.providers = providers
  context.walletsPks = walletsPks
  const telegramNotifierService = new TelegramNotifierService({
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  })
  const liquidationBotLogRepository = new LiquidationBotLogRepository(prismaClient)
  const liquidationBotService = new LiquidationBotLogService(liquidationBotLogRepository, telegramNotifierService)

  const liquidationService = new LiquidationService(new ActiveBorrowersRepository(prismaClient), context, liquidationBotService)
  liquidationService.minEthBalance = indexerConfig.minEthBalance
  liquidationService.curveRouterAddress = routers.CURVE_V1_2_ROUTER

  return {
    liquidationService,
    context,
    liquidationBotService,
    telegramNotifierService,
    prismaClient,
  }
}
