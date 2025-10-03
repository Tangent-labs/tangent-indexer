import { PrismaClient } from "@prisma/client"

import { PriceRepository } from "../db/PriceRepository.js"
import { PricePointService } from "../services/PricePointService.js"
import { setUpIndexer } from "../config/indexer_setup.js"
import { MarketContractsRepository } from "../db/MarketContractsRepository.js"
import { getAddressesJson } from "../utils/jsonReader.js"

import { v4 as uuidv4 } from "uuid"
import { PointsBotLogRepository } from "db/PointsBotLogRepository.js"
import { TelegramNotifierService } from "services/TelegramNotificationServices.js"
import { NotificationService } from "services/NotificationService.js"
import { POINTS_BOT_ACTIONS } from "type/data.js"

const snapshotPrices = async () => {
  const executionKey = uuidv4()
  const { providers } = setUpIndexer()

  const prisma = new PrismaClient()
  const addresses = await getAddressesJson()
  const priceService = new PricePointService(new PriceRepository(prisma), new MarketContractsRepository(prisma), providers.at(0)!, addresses)
  const notificationRepository = new PointsBotLogRepository(prisma)
  const telegramNotifierService = new TelegramNotifierService({
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  })
  const notificationService = new NotificationService(notificationRepository, telegramNotifierService)

  const result = await priceService.fetchPriceFeed()
  await notificationService.addPointNotification(executionKey, POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES)

  if (result?.warnings?.length > 0) {
    for (const warning of result.warnings) {
      console.log("warning", warning.level, warning.level)
      if (warning.level === "WARNING") {
        await notificationService.addPointWarningNotification(executionKey, POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES, warning)
      }
      if (warning.level === "ERROR") {
        const message = `Error in points processus : POINTS_FETCH_PRICES/${warning.apiName}, error:  ${warning.error}`
        await notificationService.addPointErrorNotification(executionKey, POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES, warning.error, message)
      }
    }
  }
}

snapshotPrices()
