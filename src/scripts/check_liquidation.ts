import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"

import { ActiveBorrowersRepository } from "../db/ActiveBorrowersRepository.js"
import { LiquidationBotLogRepository } from "../db/LiquidationBotLogRepository.js"

import { LiquidationService } from "../services/LiquidationService.js"
import { LiquidationBotLogService } from "../services/LiquidationBotLogService.js"
import { CheckLiquidationService } from "../services/CheckLiquidationService.js"

import { indexerConfig } from "../config/indexer_config.js"
import { LiquidationExecutionContext } from "../services/LiquidationExecutionContext.js"
import { setUpIndexer } from "../config/indexer_setup.js"
import { TelegramNotifierService } from "../services/TelegramNotificationServices.js"
import { routers } from "@tangent/defi-resources"

dotenv.config()
const { providers, walletsPks, handleError } = setUpIndexer()
const { liquidationService, context, liquidationBotService, telegramNotifierService } = setUpCheckLiquidationServices()

// Run main function if this file is being run directly
if (process.env.NODE_ENV !== "test") {
  const checkLiquidationService = new CheckLiquidationService(liquidationService, context, liquidationBotService, telegramNotifierService, providers)
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
  const telegramNotifierService = new TelegramNotifierService({
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  })
  const liquidationBotLogRepository = new LiquidationBotLogRepository(prismaClient)
  const liquidationBotService = new LiquidationBotLogService(liquidationBotLogRepository, telegramNotifierService)

  const activeBorrowersRepository = new ActiveBorrowersRepository(prismaClient)
  const liquidationService = new LiquidationService(activeBorrowersRepository, context, liquidationBotService)
  liquidationService.minEthBalance = indexerConfig.minEthBalance
  liquidationService.curveRouterAddress = routers.CURVE_V1_2_ROUTER

  return {
    liquidationService,
    context,
    liquidationBotService,
    telegramNotifierService,
  }
}
