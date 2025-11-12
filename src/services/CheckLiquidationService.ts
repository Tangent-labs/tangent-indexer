import { AddressLike, JsonRpcProvider } from "ethers"
import { LiquidationService } from "./LiquidationService.js"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext.js"
import { LiquidationBotLogService } from "./LiquidationBotLogService.js"
import { LiquidationBotLogAction, LiquidationUserFullInfo, LiquidationUserInInfo } from "../type/data.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"

export class CheckLiquidationService {
  private liquidationService: LiquidationService
  private context: LiquidationExecutionContext
  private liquidationBotService: LiquidationBotLogService
  private telegramNotifierService: TelegramNotifierService
  private providers: JsonRpcProvider[]

  constructor(
    liquidationService: LiquidationService,
    context: LiquidationExecutionContext,
    liquidationBotService: LiquidationBotLogService,
    telegramNotifierService: TelegramNotifierService,
    providers: JsonRpcProvider[]
  ) {
    this.liquidationService = liquidationService
    this.context = context
    this.liquidationBotService = liquidationBotService
    this.telegramNotifierService = telegramNotifierService
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
        await this.telegramNotifierService.sendError(`Liquidation Error on ${currentAction}: No on chain data `)
        return
      }

      currentAction = "liquidation_analysis"
      const { seizingList, liquidationList, notDebtorAnymoreList } = await this.liquidationService.analyzeLiquidation(onChainData, borrowers)
      await this.liquidationBotService.logLiquidationAnalysis({ seizingList, liquidationList, notDebtorAnymoreList }, this.context)

      currentAction = "liquidation_prioritization"
      const prioritizedLiquidationList = this.liquidationService.prioritizeActions(seizingList || [], liquidationList || [])

      // Distribute actions across wallets in round-robin fashion
      const walletQueues: Array<Array<LiquidationUserFullInfo & { type: "seizing" | "liquidation" }>> = []
      const walletCount = this.context.walletsPks.length

      // Initialize queues for each wallet
      for (let i = 0; i < walletCount; i++) {
        walletQueues.push([])
      }

      // Distribute actions to wallets in round-robin
      if (prioritizedLiquidationList && prioritizedLiquidationList.length > 0) {
        prioritizedLiquidationList.forEach((action, actionIndex) => {
          const walletIndex = actionIndex % walletCount
          walletQueues[walletIndex].push(action)
        })
      }

      if (notDebtorAnymoreList && notDebtorAnymoreList.length > 0) {
        try {
          await this.liquidationBotService.logCleanDebtors(notDebtorAnymoreList || null, this.context)
        } catch (e) {
          await this.liquidationBotService.logError("error", e as Error, this.context, { notDebtorAnymoreList }, false)
        }
      }

      currentAction = "liquidation_execution"

      // Process each wallet's queue sequentially (to avoid nonce issues)
      // But process wallets in parallel
      // Note: map with async callbacks creates promises that start executing immediately
      // This is the desired behavior - all wallets process in parallel
      const walletPromises = walletQueues.map(async (queue, walletIndex) => {
        // Process actions in this wallet's queue sequentially
        for (const action of queue) {
          if (action.type === "seizing") {
            await this.liquidationService.executeSeizing(walletIndex, action as unknown as LiquidationUserFullInfo)
          } else {
            await this.liquidationService.executeLiquidation(walletIndex, action as unknown as LiquidationUserFullInfo)
          }
        }
      })

      // Wait for all wallet queues to complete (they're already running in parallel)
      if (walletPromises.length > 0) {
        await Promise.all(walletPromises)
      }
      console.log("Liquidation errors:", this.liquidationService.errors)

      // The end
      this.liquidationBotService.logEndExecution(this.context)
    } catch (e) {
      await this.liquidationBotService.logError(currentAction, e as Error, this.context)
      await this.telegramNotifierService.sendError(`Liquidation Error on ${currentAction}: ${(e as Error).message}`)

      throw e
    }
  }
}
