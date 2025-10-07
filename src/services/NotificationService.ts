import { LiquidationBotLogAction } from "../type/data.js"

export class NotificationService {
  async sendImmediateNotification(message: string, action?: LiquidationBotLogAction) {
    console.log(message, action)
  }
}

