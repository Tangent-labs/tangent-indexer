import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"

import { ActiveBorrowersRepository } from "../db/ActiveBorrowersRepository.js"
import { LiquidationBotLogRepository } from "../db/LiquidationBotLogRepository.js"

import { LiquidationService } from "../services/LiquidationService.js"
import { LiquidationBotService } from "../services/LiquidationBotLogService.js"
import { NotificationService } from "../services/NotificationService.js"
import { CheckLiquidationService } from "../services/CheckLiquidationService.js"

import { indexerConfig } from "../config/indexer_config.js"
import { LiquidationExecutionContext } from "../services/LiquidationExecutionContext.js"
import { setUpIndexer } from "../config/indexer_setup.js"
import { PointsBotLogRepository } from "../db/Points/PointsBotLogRepository.js"
import { TelegramNotifierService } from "../services/TelegramNotificationServices.js"

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
  const pointsBotLogRepository = new PointsBotLogRepository(prismaClient)
  const telegramNotifierService = new TelegramNotifierService({
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  })
  const notificationService = new NotificationService(pointsBotLogRepository, telegramNotifierService)

  return {
    liquidationService,
    context,
    liquidationBotService,
    notificationService,
  }
}
