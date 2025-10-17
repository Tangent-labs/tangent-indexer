import { PrismaClient } from "@prisma/client"
import { PointsBotLogRepository } from "../db/Points/PointsBotLogRepository.js"
import { TelegramNotifierService } from "../services/TelegramNotificationServices.js"
import dotenv from "dotenv"
import { NotificationService } from "../services/NotificationService.js"

dotenv.config()

const sendPointsExecutionSummary = async () => {
  const prisma = new PrismaClient()
  const notificationRepository = new PointsBotLogRepository(prisma)

  const telegramNotifierService = new TelegramNotifierService({
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  })
  const notificationService = new NotificationService(notificationRepository, telegramNotifierService)
  await notificationService.sendDaySummaryNotification()
}

sendPointsExecutionSummary().then(() => {
  process.exit(0)
})
