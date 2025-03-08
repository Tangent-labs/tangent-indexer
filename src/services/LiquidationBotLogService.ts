import { LiquidationBotLogRepository } from "db/LiquidationBotLogRepository"
import { AddressLike } from "ethers"
import { LiquidationBotLogAction, LiquidationMarketAccountOutInfo, LiquidationUserInInfo } from "type/data"

export class LiquidationBotService {
  liquidationBotLogRepository: LiquidationBotLogRepository
  executionKey: string

  constructor(LiquidationBotLogRepository: LiquidationBotLogRepository) {
    this.liquidationBotLogRepository = LiquidationBotLogRepository
    this.executionKey = uuidv4()
  }

  async _logAction(action: LiquidationBotLogAction, data?: unknown, isError?: boolean) {
    await this.liquidationBotLogRepository.insertLiquidationLog({
      action: action as string,
      execution_key: this.executionKey,
      data: data ? JSON.stringify(data) : '{"no_data":true}',
      is_error: isError,
    })
  }

  async logError(action: LiquidationBotLogAction, error: Error) {
    await this._logAction(action, error, true)
  }

  async logLiquidationParams(data: { markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }) {
    const action: LiquidationBotLogAction = "liquidation_params"
    await this._logAction(action, data)
  }

  async logOnchainData(data?: LiquidationMarketAccountOutInfo) {
    const action: LiquidationBotLogAction = "on_chain_data"
    await this._logAction(action, data)
  }

  async logLiquidationAnalysis(data?: LiquidationMarketAccountOutInfo) {
    const action: LiquidationBotLogAction = "liquidation_analysis"
    await this._logAction(action, data)
  }

  async logCleanDebtors(data?: LiquidationUserInInfo[]) {
    const action: LiquidationBotLogAction = "clean_debtors"
    await this._logAction(action, data)
  }

  async logLiquidationExecution(data?: LiquidationUserInInfo) {
    const action: LiquidationBotLogAction = "liquidation_execution"
    await this._logAction(action, data)
  }

  async logLiquidationBadDebtExecution(data?: LiquidationUserInInfo) {
    const action: LiquidationBotLogAction = "liquidation_bad_debt_execution"
    await this._logAction(action, data)
  }
}
