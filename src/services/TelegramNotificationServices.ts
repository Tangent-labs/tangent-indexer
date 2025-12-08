import axios, { AxiosResponse } from "axios"
import { TelegramNotificationConfig } from "../type/service.js"

export interface SendMessageOptions {
  text: string
  parseMode?: "HTML" | "Markdown" | "MarkdownV2"
  disableWebPagePreview?: boolean
  disableNotification?: boolean
}

export class TelegramNotifierService {
  private readonly botToken: string
  private readonly chatId: string
  private readonly baseUrl: string

  constructor(config: TelegramNotificationConfig) {
    this.botToken = config.botToken
    this.chatId = config.chatId
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`
  }

  /**
   * Send a message to the configured Telegram chat
   * @returns Promise<boolean> - Returns true if message was sent successfully
   */
  async sendMessage(text: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      console.error("Telegram bot token or chat id is not set")
      return false
    }
    const cleanedText = text
    if (!cleanedText) {
      return false
    }

    try {
      const response: AxiosResponse = await axios.post(
        `${this.baseUrl}/sendMessage`,
        {
          chat_id: this.chatId,
          text: cleanedText,
          parse_mode: "MarkdownV2",
          disableWebPagePreview: true,
          disableNotification: false,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      )

      return response.data.ok === true
    } catch (error) {
      console.error("Error sending Telegram message:", error)
      return false
    }
  }

  /**
   * Send a simple text message
   * @param text - The message text to send
   * @returns Promise<boolean> - Returns true if message was sent successfully
   */
  async sendText(text: string): Promise<boolean> {
    return this.sendMessage(text)
  }

  /**
   * Send an error message with error emoji
   * @param message - The error message to send
   * @returns Promise<boolean> - Returns true if message was sent successfully
   */
  async sendError(message: string): Promise<boolean> {
    return this.sendMessage(`${message}`)
  }
}
