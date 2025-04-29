import { LiquidationBotLogRepository } from "db/LiquidationBotLogRepository"
import { AddressLike } from "ethers"
import { LiquidationBotLogAction, LiquidationMarketAccountOutInfo, LiquidationUserInfo, LiquidationUserInInfo } from "type/data"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext"
import { prepareSerialize } from "utils/jsonSerializer"

export class LiquidationBotService {
  liquidationBotLogRepository: LiquidationBotLogRepository

  constructor(LiquidationBotLogRepository: LiquidationBotLogRepository) {
    this.liquidationBotLogRepository = LiquidationBotLogRepository
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

  async logError(action: LiquidationBotLogAction, error: Error, context: LiquidationExecutionContext, additionalData?: any) {
    await this._logAction(action, context, { ...error, ...additionalData }, true)
  }

  async logLiquidationParams(data: { markets: AddressLike[] | null; borrowers: LiquidationUserInInfo[] | null }, context: LiquidationExecutionContext) {
    const action: LiquidationBotLogAction = "liquidation_params"
    await this._logAction(action, context, data)
  }

  async logOnchainData(data: LiquidationMarketAccountOutInfo | null, context: LiquidationExecutionContext) {
    const action: LiquidationBotLogAction = "on_chain_data"
    await this._logAction(action, context, data)
  }

  async logLiquidationAnalysis(data: LiquidationMarketAccountOutInfo | null, context: LiquidationExecutionContext) {
    const action: LiquidationBotLogAction = "liquidation_analysis"
    await this._logAction(action, context, data)
  }

  async logCleanDebtors(data: LiquidationUserInInfo[] | null, context: LiquidationExecutionContext) {
    const action: LiquidationBotLogAction = "clean_debtors"
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
