import { PrismaClient } from "@prisma/client"

import { PriceRepository } from "../db/PriceRepository.js"
import { PricePointService } from "../services/PricePointService.js"
import { setUpIndexer } from "../config/indexer_setup.js"
import { MarketContractsRepository } from "../db/MarketContractsRepository.js"
import { getAddressesJson } from "../utils/jsonReader.js"

import { v4 as uuidv4 } from "uuid"
import { PointsBotLogRepository } from "../db/PointsBotLogRepository.js"
import { TelegramNotifierService } from "../services/TelegramNotificationServices.js"
import { NotificationService } from "../services/NotificationService.js"
import { POINTS_BOT_ACTIONS } from "../type/data.js"

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
  await notificationService.addPointNotification(executionKey, {
    process: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
    error: null,
    action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
    message: "Execution",
    level: "INFO",
  })

  if (result?.notifications?.length > 0) {
    // Collect all notifications to create them in batch
    const notificationsToCreate = []

    for (const notification of result.notifications) {
      if (notification.level === "WARNING") {
        notificationsToCreate.push({
          action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
          errorLevel: "WARNING" as const,
          message: `WARNING in ${POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES}`,
          data: JSON.stringify(notification),
        })
      }
      if (notification.level === "ERROR") {
        const message = `Error in points process : POINTS_FETCH_PRICES/${notification.process}, error:  ${notification.error}`
        notificationsToCreate.push({
          action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
          errorLevel: "ERROR" as const,
          message,
          data: JSON.stringify(notification),
        })
      }
    }

    // Create all notifications in a single batch operation
    if (notificationsToCreate.length > 0) {
      await notificationService.createMultiNotifications(executionKey, notificationsToCreate)
    }
  }
}

snapshotPrices()
