import { LiquidationBotLogRepository } from "db/LiquidationBotLogRepository"
import { AddressLike } from "ethers"
import { LiquidationBotLogAction, LiquidationMarketAccountOutInfo, LiquidationUserInInfo } from "type/data"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext"
import { prepareSerialize } from "utils/jsonSerializer"

export class LiquidationBotService {
  liquidationBotLogRepository: LiquidationBotLogRepository

  constructor(LiquidationBotLogRepository: LiquidationBotLogRepository) {
    this.liquidationBotLogRepository = LiquidationBotLogRepository
  }

  async _logAction(action: LiquidationBotLogAction, context: LiquidationExecutionContext, data?: unknown, isError?: boolean) {
    const dataToLog = { context, data: data || { no_data: true } }

    await this.liquidationBotLogRepository.insertLiquidationLog({
      action: action as string,
      execution_key: context.executionKey,
      data: prepareSerialize(dataToLog),
      is_error: isError,
    })
  }

  async logError(action: LiquidationBotLogAction, error: Error, context: LiquidationExecutionContext) {
    await this._logAction(action, context, error, true)
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

  async logLiquidationBadDebtExecution(data: LiquidationUserInInfo | null, context: LiquidationExecutionContext) {
    const action: LiquidationBotLogAction = "liquidation_bad_debt_execution"
    await this._logAction(action, context, data)
  }
}
