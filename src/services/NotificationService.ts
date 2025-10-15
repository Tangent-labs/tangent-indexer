import { PointsBotLogRepository } from "db/PointsBotLogRepository.js"
import { LiquidationBotLogAction, NotificationBotAction, NotificationBotErrorLevel, NotificationMessage } from "type/data.js"
import { prepareSerialize } from "utils/jsonSerializer.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"

export class NotificationService {
  private readonly telegramNotifierService: TelegramNotifierService

  constructor(
    private readonly notificationRepository: PointsBotLogRepository,
    telegramNotifierService: TelegramNotifierService
  ) {
    this.notificationRepository = notificationRepository
    this.telegramNotifierService = telegramNotifierService
  }

  async getDaySummary(date?: Date) {
    // get all notificaiton for the day before now from 0:00:00 to 23:59:59
    const referenceDate = date || new Date()

    const startOfDay = new Date(new Date(referenceDate).setHours(0, 0, 0, 0))
    const endOfDay = new Date(new Date(referenceDate).setHours(23, 59, 59, 999))
    const notifications = await this.notificationRepository.getLogsByDateRange(startOfDay, endOfDay)
    // count how many execution  for each action use execution_key
    const summary = notifications.reduce(
      (acc, notification) => {
        if (!acc[notification.action]) {
          acc[notification.action] = { count: 0, warning: 0, error: 0 }
        }
        if (notification.errorLevel === "WARNING") {
          acc[notification.action].warning++
        }
        if (notification.errorLevel === "ERROR") {
          acc[notification.action].error++
        }
        if (notification.errorLevel === "INFO") {
          acc[notification.action].count++
        }
        return acc
      },
      {} as Record<string, { count: number; warning: number; error: number }>
    )
    let summaryMessage = `Summary of the day : ${startOfDay.toLocaleDateString()} to ${endOfDay.toLocaleDateString()}\n`
    for (const action in summary) {
      summaryMessage += `\n - ${action}: ${summary[action].count} executions, ${summary[action].warning} warnings, ${summary[action].error} errors`
    }
    return {
      summary,
      message: summaryMessage,
    }
  }

  async sendDaySummaryNotification() {
    const { message } = await this.getDaySummary()
    await this.sendNotification(message)
  }

  async addPointErrorNotification(executionkey: string, notificationMessage: NotificationMessage) {
    const { action, error, message } = notificationMessage
    const notifData = {
      execution_key: executionkey,
      action: action!,
      errorLevel: "ERROR" as NotificationBotErrorLevel,
      message: message || error instanceof Error ? error?.message : "Unknown error",
      data: prepareSerialize(error),
    }
    try {
      let notifErrorMessage = message
      if (!notifErrorMessage) {
        notifErrorMessage = `Error in points process : ${action}, error: ${(error?.message?.length || 0) > 100 ? error?.message.slice(0, 100) + "..." : error?.message} `
      }

      await this.sendErrorNotification(notifErrorMessage)
    } catch (e) {
      console.error("Error sending immediate notification", e)
    }

    await this.notificationRepository.insertPointsBotLog(notifData)
  }

  async addPointWarningNotification(executionkey: string, notificationMessage: NotificationMessage) {
    const { action, message, ...data } = notificationMessage
    const notifData = {
      execution_key: executionkey,
      action: action!,
      errorLevel: "WARNING" as NotificationBotErrorLevel,
      message: message || `WARNING in ${action}`,
      data: prepareSerialize(data),
    }
    await this.notificationRepository.insertPointsBotLog(notifData)
  }

  async addPointNotification(executionkey: string, notificationMessage: NotificationMessage) {
    const { action } = notificationMessage
    const notifData = {
      execution_key: executionkey,
      action: action!,
      errorLevel: "INFO" as NotificationBotErrorLevel,
      message: `Nominal action : ${action}`,
      data: prepareSerialize({}),
    }
    await this.notificationRepository.insertPointsBotLog(notifData)
  }

  /**
   * Create multiple notifications in a single batch operation
   */
  async createMultiNotifications(
    executionKey: string,
    notifications: Array<{
      action: NotificationBotAction
      errorLevel: NotificationBotErrorLevel
      message: string
      data: string
    }>
  ) {
    if (notifications.length > 0) {
      const notificationsWithExecutionKey = notifications.map((notification) => ({
        ...notification,
        execution_key: executionKey,
      }))
      await this.notificationRepository.createMulti(notificationsWithExecutionKey)
    }
  }

  async sendNotification(message: string) {
    await this.telegramNotifierService.sendMessage(message)
  }

  async sendErrorNotification(message: string) {
    await this.telegramNotifierService.sendError(message)
  }

  async sendImmediateNotification(message: string, action?: LiquidationBotLogAction) {
    console.log(message, action)
    // TODO: recable with sendNotification mechanism
  }
}
