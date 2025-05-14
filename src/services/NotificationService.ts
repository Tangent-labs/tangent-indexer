import { LiquidationBotLogAction } from "type/data"

class NotificationService {
  async sendImmediateNotification(message: string, action?: LiquidationBotLogAction) {
    console.log(message, action)
  }
}

export default NotificationService
