import { LiquidationBotLogRepository } from "../db/LiquidationBotLogRepository.js"
import {
  LiquidationAnalyseInfo,
  LiquidationBotLogAction,
  LiquidationExecutionResult,
  LiquidationMarketAccountOutInfo,
  LiquidationUserInInfo,
} from "../type/data.js"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext.js"
import { prepareSerialize } from "../utils/jsonSerializer.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"
import { AddressLike } from "ethers"
import { compactOnchainDataToCsv } from "../utils/csvCompactor.js"

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

    // For on_chain_data action, compact the data to CSV format to save space
    // Only compact if data is actually a LiquidationMarketAccountOutInfo (has markets and accounts properties)
    let dataToLog: any
    if (action === "on_chain_data" && data !== null && data !== undefined) {
      const onChainData = data as LiquidationMarketAccountOutInfo
      // Check if data has the expected structure (markets and accounts arrays)
      if (onChainData.markets && Array.isArray(onChainData.markets) && onChainData.accounts && Array.isArray(onChainData.accounts)) {
        const csvData = compactOnchainDataToCsv(onChainData)
        dataToLog = {
          context: loggedContext,
          data: {
            markets: csvData.marketsCsv,
            accounts: csvData.accountsCsv,
          },
        }
      } else {
        // If it's not the expected structure (e.g., error data), log it normally
        dataToLog = { context: loggedContext, data: data || { no_data: true } }
      }
    } else {
      dataToLog = { context: loggedContext, data: data || { no_data: true } }
    }

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
      await this.telegramNotifierService.sendError(fullMessage)
    }

    // Extract error information, including any custom properties
    const errorInfo: any = {
      message: error.message,
      name: error.name,
      stack: error.stack,
    }

    // Include code if it exists (from ethers errors)
    if ((error as any).code) {
      errorInfo.code = (error as any).code
    }

    // Include data if it exists (from ethers errors)
    if ((error as any).data) {
      errorInfo.data = (error as any).data
    }

    // Merge with parsed error from additionalData if it exists
    if (additionalData?.error) {
      // Merge parsed error info (code, errorName, decodedMessage, rawData) into errorInfo
      if (additionalData.error.code) errorInfo.code = additionalData.error.code
      if (additionalData.error.errorName) errorInfo.errorName = additionalData.error.errorName
      if (additionalData.error.decodedMessage) errorInfo.decodedMessage = additionalData.error.decodedMessage
      if (additionalData.error.rawData) errorInfo.rawData = additionalData.error.rawData

      // Only include originalError if it has useful information
      if (additionalData.error.originalError) {
        const origError = additionalData.error.originalError
        // Only include if it's not an empty object and has useful properties
        if (typeof origError === "object" && origError !== null) {
          const hasUsefulInfo =
            origError.message ||
            origError.name ||
            origError.code ||
            origError.stack ||
            (Object.keys(origError).length > 0 && Object.keys(origError).some((k) => k !== "constructor"))

          if (hasUsefulInfo) {
            errorInfo.originalError = {
              message: origError.message,
              name: origError.name,
              code: origError.code,
              stack: origError.stack,
            }
          }
        }
      }
    }

    // Ensure account data is always accessible at the top level
    // Remove the nested error from additionalData since we've merged it into errorInfo
    const { error: _, ...restAdditionalData } = additionalData || {}
    const errorData = {
      error: errorInfo,
      ...restAdditionalData,
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

  async logLiquidationExecution(data: LiquidationUserInInfo | null, context: LiquidationExecutionContext, executionResult?: LiquidationExecutionResult) {
    await this.liquidationBotLogRepository.insertLiquidationExecution({
      execution_key: context.executionKey,
      market: (data?.market as string) ?? "",
      borrower: (data?.account as string) ?? "",
      type: "liquidation",
      success: true,
      repaid_amount: executionResult?.repaidAmount?.toString() ?? null,
      fee: executionResult?.fee?.toString() ?? null,
      collateral_liquidated: executionResult?.collateralLiquidated?.toString() ?? null,
      debt_shares: executionResult?.debtShares?.toString() ?? null,
      liquidator: executionResult?.liquidator ?? null,
      profit: executionResult?.liquidationProfit?.toString() ?? null,
      tx_hash: executionResult?.transactionHash ?? null,
    })
  }

  async logLiquidationExecutionError(context: LiquidationExecutionContext, error: Error, account?: { account?: AddressLike; market?: AddressLike }) {
    await this.liquidationBotLogRepository.insertLiquidationExecution({
      execution_key: context.executionKey,
      market: (account?.market as string) ?? "",
      borrower: (account?.account as string) ?? "",
      type: "liquidation",
      success: false,
      error_message: error.message?.slice(0, 500) ?? null,
    })
  }

  async logEndExecution(context: LiquidationExecutionContext) {
    const action: LiquidationBotLogAction = "end_execution"
    await this._logAction(action, context, null)
  }

  async logLiquidationBadDebtExecution(data: LiquidationUserInInfo | null, context: LiquidationExecutionContext, txHash?: string) {
    await this.liquidationBotLogRepository.insertLiquidationExecution({
      execution_key: context.executionKey,
      market: (data?.market as string) ?? "",
      borrower: (data?.account as string) ?? "",
      type: "seizing",
      success: true,
      tx_hash: txHash ?? null,
    })
  }

  async logLiquidationBadDebtExecutionError(context: LiquidationExecutionContext, error: Error, account?: { account?: AddressLike; market?: AddressLike }) {
    await this.liquidationBotLogRepository.insertLiquidationExecution({
      execution_key: context.executionKey,
      market: (account?.market as string) ?? "",
      borrower: (account?.account as string) ?? "",
      type: "seizing",
      success: false,
      error_message: error.message?.slice(0, 500) ?? null,
    })
  }
}
