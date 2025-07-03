import { AddressLike, JsonRpcProvider } from "ethers"
import { LiquidationService } from "./LiquidationService"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext"
import { LiquidationBotService } from "./LiquidationBotLogService"
import { LiquidationBotLogAction, LiquidationUserFullInfo, LiquidationUserInInfo } from "../type/data"
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
    let currentAction: LiquidationBotLogAction = "check_context"

    try {
      // check the context

      await this.liquidationService.checkContext()

      currentAction = "liquidation_params"
      let markets: AddressLike[] = []
      let borrowers: LiquidationUserInInfo[] = []
      // Get the parameters

      const params = await this.liquidationService.getLiquidationParams()
      markets = params.markets
      borrowers = params.borrowers
      await this.liquidationBotService.logLiquidationParams({ markets, borrowers }, this.context)
      if (!borrowers.length) {
        return
      }
      // save the params in files
      if (this.context.isDbAlive) {
        this.liquidationService.saveFiles({ markets, borrowers })
      }

      currentAction = "on_chain_data"
      const onChainData = await this.liquidationService.getOnchainData(this.providers, markets, borrowers)
      await this.liquidationBotService.logOnchainData(onChainData || null, this.context)
      if (!onChainData) {
        await this.notificationService.sendImmediateNotification("No on chain data", currentAction)
        return
      }

      currentAction = "liquidation_analysis"
      const { hardLiquidationList, softLiquidationList, notDebtorAnymoreList } = await this.liquidationService.analyzeLiquidation(onChainData, borrowers)
      await this.liquidationBotService.logLiquidationAnalysis(onChainData || null, this.context)

      currentAction = "liquidation_prioritization"
      const prioritizedLiquidationList = this.liquidationService.prioritizeActions(hardLiquidationList || [], softLiquidationList || [])
      const actions: Promise<void>[] = []
      if (prioritizedLiquidationList && prioritizedLiquidationList.length > 0) {
        prioritizedLiquidationList.forEach((a, index) => {
          if (a.type === "hard") {
            actions.push(this.liquidationService.executeHardLiquidation(index, a as unknown as LiquidationUserFullInfo))
          } else {
            actions.push(this.liquidationService.executeSoftLiquidation(index, a as unknown as LiquidationUserFullInfo))
          }
        })
      }

      if (notDebtorAnymoreList && notDebtorAnymoreList.length > 0) {
        actions.push(
          this.liquidationService.processCleanDebtors(notDebtorAnymoreList || []).then(() => {
            this.liquidationBotService.logCleanDebtors(notDebtorAnymoreList || null, this.context)
          })
        )
      }
      currentAction = "liquidation_execution"

      // run all actions in parallel
      if (actions.length > 0) {
        await Promise.all(actions)
      }

      // The end
      this.liquidationBotService.logEndExecution(this.context)
    } catch (e) {
      await this.liquidationBotService.logError(currentAction, e as Error, this.context)
      await this.notificationService.sendImmediateNotification((e as Error).message)
      throw e
    }
  }
}
