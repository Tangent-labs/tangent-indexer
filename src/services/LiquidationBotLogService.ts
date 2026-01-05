import { LiquidationBotLogRepository } from "../db/LiquidationBotLogRepository.js"
import { LiquidationAnalyseInfo, LiquidationBotLogAction, LiquidationMarketAccountOutInfo, LiquidationUserInfo, LiquidationUserInInfo } from "../type/data.js"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext.js"
import { prepareSerialize } from "../utils/jsonSerializer.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"
import { AddressLike } from "ethers"

/**
 * Escape special characters for MarkdownV2 format
 * Characters that need escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
function escapeMarkdownV2(text: string): string {
  // Escape all special MarkdownV2 characters
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1")
}

export class LiquidationBotLogService {
  liquidationBotLogRepository: LiquidationBotLogRepository
  private readonly telegramNotifierService: TelegramNotifierService

  constructor(LiquidationBotLogRepository: LiquidationBotLogRepository, telegramNotifierService: TelegramNotifierService) {
    this.liquidationBotLogRepository = LiquidationBotLogRepository
    this.telegramNotifierService = telegramNotifierService
  }

  private _cleanContext(context: LiquidationExecutionContext) {
    // we replace the wallets pks by PK0x0, PK0x1, PK0x2, ... for database storage
    const newContext = { ...context }
    newContext.walletsPks = newContext.walletsPks.map((_, index) => `PK0x${index}`)
    return newContext
  }

  async _logAction(action: LiquidationBotLogAction, context: LiquidationExecutionContext, data?: unknown, isError?: boolean) {
    const loggedContext = this._cleanContext(context)
    const dataToLog = { context: loggedContext, data: data || { no_data: true } }

    await this.liquidationBotLogRepository.insertLiquidationLog({
      action: action as string,
      execution_key: context.executionKey,
      data: prepareSerialize(dataToLog),
      is_error: isError,
    })
  }

  async logError(
    action: LiquidationBotLogAction,
    error: Error,
    context: LiquidationExecutionContext,
    additionalData?: any,
    sendTelegramNotification?: boolean
  ) {
    // Send Telegram notification by default (unless explicitly disabled)
    if (sendTelegramNotification) {
      const fullMessage = `Liquidation Error in action ${action}: ${error.message.slice(0, 100)}`
      await this.telegramNotifierService.sendError(escapeMarkdownV2(fullMessage))
    }
    // Ensure account data is always accessible at the top level
    const errorData = {
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      ...additionalData,
    }
    await this._logAction(action, context, errorData, true)
  }

  async logLiquidationParams(data: { markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }, context: LiquidationExecutionContext) {
    const action: LiquidationBotLogAction = "liquidation_params"
    await this._logAction(action, context, data)
  }

  async logOnchainData(data: LiquidationMarketAccountOutInfo | null, context: LiquidationExecutionContext) {
    const action: LiquidationBotLogAction = "on_chain_data"
    await this._logAction(action, context, data)
  }

  async logLiquidationAnalysis(data: LiquidationAnalyseInfo | null, context: LiquidationExecutionContext) {
    const action: LiquidationBotLogAction = "liquidation_analysis"
    await this._logAction(action, context, data)
  }

  async logLiquidationExecution(data: LiquidationUserInInfo | null, context: LiquidationExecutionContext) {
    const action: LiquidationBotLogAction = "liquidation_execution"
    await this._logAction(action, context, data)
  }

  async logEndExecution(context: LiquidationExecutionContext) {
    const action: LiquidationBotLogAction = "end_execution"
    await this._logAction(action, context, null)
  }

  async logLiquidationBadDebtExecution(data: LiquidationUserInfo | null, context: LiquidationExecutionContext) {
    const action: LiquidationBotLogAction = "liquidation_bad_debt_execution"
    await this._logAction(action, context, data)
  }
}
