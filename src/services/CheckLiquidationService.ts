import { JsonRpcProvider } from "ethers"
import { LiquidationService } from "./LiquidationService"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext"
import { LiquidationBotService } from "./LiquidationBotLogService"
import { LiquidationBotLogAction } from "../type/data"
import NotificationService from "./NotificationService"

export class CheckLiquidationService {
  private liquidationService: LiquidationService
  private context: LiquidationExecutionContext
  private liquidationBotService: LiquidationBotService
  private notificationService: NotificationService
  private providers: JsonRpcProvider[]

  constructor(
    liquidationService: LiquidationService,
    context: LiquidationExecutionContext,
    liquidationBotService: LiquidationBotService,
    notificationService: NotificationService,
    providers: JsonRpcProvider[]
  ) {
    this.liquidationService = liquidationService
    this.context = context
    this.liquidationBotService = liquidationBotService
    this.notificationService = notificationService
    this.providers = providers
  }

  async run() {
    // keep track of the current action in case of an error
    let currentAction: LiquidationBotLogAction = "liquidation_params"

    try {
      // Get the parameters
      const { markets, borrowers } = await this.liquidationService.getLiquidationParams()
      await this.liquidationBotService.logLiquidationParams({ markets, borrowers }, this.context)
      if (!borrowers.length) {
        return
      }
      if (this.context.isDbAlive) {
        this.liquidationService.saveFiles({ markets, borrowers })
      }

      currentAction = "on_chain_data"
      // Get the data
      const onChainData = await this.liquidationService.getOnchainData(this.providers, markets, borrowers)
      await this.liquidationBotService.logOnchainData(onChainData || null, this.context)
      if (!onChainData) {
        return
      }

      currentAction = "liquidation_analysis"
      // Analysis
      const { hardLiquidationList, softLiquidationList, notDebtorAnymoreList } = await this.liquidationService.analyzeLiquidation(onChainData, borrowers)
      await this.liquidationBotService.logLiquidationAnalysis(onChainData || null, this.context)

      // Actions
      if (hardLiquidationList && hardLiquidationList.length > 0) {
        currentAction = "liquidation_bad_debt_execution"
        await this.liquidationService.processHardLiquidations(this.providers, hardLiquidationList)
      }
      if (softLiquidationList && softLiquidationList.length > 0) {
        currentAction = "liquidation_execution"
        await this.liquidationService.processSoftLiquidations(this.providers, softLiquidationList)
      }
      if (notDebtorAnymoreList && notDebtorAnymoreList.length > 0) {
        currentAction = "clean_debtors"
        await this.liquidationService.processCleanDebtors(notDebtorAnymoreList)
        await this.liquidationBotService.logCleanDebtors(notDebtorAnymoreList || null, this.context)
      }
    } catch (e) {
      await this.liquidationBotService.logError(currentAction, e as Error, this.context)
      await this.notificationService.sendImmediateNotification((e as Error).message)
      throw e
    }
  }
}
