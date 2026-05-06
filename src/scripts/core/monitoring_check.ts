import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"

import { indexerConfig } from "../../config/indexer_config.js"
import { IndexerExecutionLogRepository } from "../../db/IndexerExecutionLogRepository.js"
import { MonitoringRepository } from "../../db/MonitoringRepository.js"
import { IndexerExecutionLogService } from "../../services/IndexerExecutionLogService.js"
import { IndexerHealthAlertService } from "../../services/IndexerHealthAlertService.js"
import { MonitoringAlertService } from "../../services/MonitoringAlertService.js"
import { TelegramNotifierService } from "../../services/TelegramNotificationServices.js"
import { INDEXER_EXECUTION_NAMES } from "../../type/indexerExecution.js"
import { toSafeErrorMessage } from "../../utils/errors.js"

dotenv.config()

async function main() {
  const { prismaClient, indexerExecutionLogService, monitoringAlertService, indexerHealthAlertService, telegramNotifierService } = setUpMonitoringCheck()
  let exitCode = 0

  try {
    await indexerExecutionLogService.run(INDEXER_EXECUTION_NAMES.MONITORING_CHECK, async () => {
      const now = new Date()
      const executionErrors: string[] = []

      await monitoringAlertService.processAlerts(now).catch(async (error) => {
        const message = toSafeErrorMessage(error)
        executionErrors.push(`MONITORING ALERT PROCESS: ${message}`)
        await telegramNotifierService.sendError(`Error on MONITORING ALERT PROCESS: ${message}`)
        console.error(error)
      })

      await indexerHealthAlertService.processAlerts(now).catch(async (error) => {
        const message = toSafeErrorMessage(error)
        executionErrors.push(`INDEXER HEALTH ALERT PROCESS: ${message}`)
        await telegramNotifierService.sendError(`Error on INDEXER HEALTH ALERT PROCESS: ${message}`)
        console.error(error)
      })

      if (executionErrors.length > 0) {
        throw new Error(executionErrors.join(" | "))
      }
    })
  } catch (error) {
    console.error(error)
    exitCode = 1
  } finally {
    await prismaClient.$disconnect()
  }

  process.exit(exitCode)
}

function setUpMonitoringCheck() {
  const prismaClient = new PrismaClient()
  const telegramNotifierService = new TelegramNotifierService({
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  })

  const monitoringRepository = new MonitoringRepository(prismaClient)
  const indexerExecutionLogRepository = new IndexerExecutionLogRepository(prismaClient)
  const indexerExecutionLogService = new IndexerExecutionLogService(indexerExecutionLogRepository)
  const monitoringAlertService = new MonitoringAlertService(
    monitoringRepository,
    telegramNotifierService,
    `${indexerConfig.sharedDataDir}/monitoring-alert-state.json`
  )
  const indexerHealthAlertService = new IndexerHealthAlertService(
    indexerExecutionLogRepository,
    telegramNotifierService,
    `${indexerConfig.sharedDataDir}/indexer-health-alert-state.json`
  )

  return {
    prismaClient,
    indexerExecutionLogService,
    monitoringAlertService,
    indexerHealthAlertService,
    telegramNotifierService,
  }
}

main().then()
