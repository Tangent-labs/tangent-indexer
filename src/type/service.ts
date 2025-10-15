import { JsonRpcProvider } from "ethers"

export type EventDetectionService = {
  runDetection: (provider: JsonRpcProvider, startingBlock: number, endingBlock: number) => Promise<void>
}

export interface TelegramNotificationConfig {
  botToken: string
  chatId: string
}
