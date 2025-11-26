import { AddressLike, JsonRpcProvider } from "ethers"
import { Queue, type Queue as BullQueue } from "bullmq"
import { LiquidationService } from "./LiquidationService.js"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext.js"
import { LiquidationBotLogService } from "./LiquidationBotLogService.js"
import { LiquidationBotLogAction, LiquidationUserInInfo, SerializedLiquidationUserFullInfo } from "../type/data.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"
import { prepareSerialize } from "../utils/jsonSerializer.js"
import { indexerConfig } from "../config/indexer_config.js"

export class CheckLiquidationService {
  private liquidationService: LiquidationService
  private context: LiquidationExecutionContext
  private liquidationBotService: LiquidationBotLogService
  private telegramNotifierService: TelegramNotifierService
  private providers: JsonRpcProvider[]
  private liquidatorQueue: BullQueue<SerializedLiquidationUserFullInfo>

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

    // Validate liquidation queue Redis configuration before creating the queue
    if (!indexerConfig?.liquidationQueueRedis?.trim()) {
      throw new Error("LIQUIDATION_QUEUE_REDIS is not configured. Please set the LIQUIDATION_QUEUE_REDIS environment variable.")
    }

    this.liquidatorQueue = new Queue<SerializedLiquidationUserFullInfo>("liquidatorQueue", {
      connection: indexerConfig.liquidationQueueRedis as any, // BullMQ accepts connection string
      defaultJobOptions: {
        attempts: indexerConfig.liquidationQueue.attempts,
        backoff: {
          type: indexerConfig.liquidationQueue.backoff.type,
          delay: indexerConfig.liquidationQueue.backoff.delay,
        },
        removeOnComplete: true, // Remove completed jobs
        removeOnFail: false, // Keep failed jobs for inspection
      },
    })
    console.log("DEBUG: liquidatorQueue", this.liquidatorQueue)
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

      currentAction = "liquidation_execution"

      if (prioritizedLiquidationList && prioritizedLiquidationList.length > 0) {
        for (const action of prioritizedLiquidationList) {
          const jobId = `${action.market}-${action.account}-${action.type}`
          // Serialize BigInt values to strings for queue storage
          const serializedAction = prepareSerialize(action) as SerializedLiquidationUserFullInfo
          const priority = action.type === "liquidation" ? 2 : 3 // less priority means processed first , so liquidation are processed first
          // 1 will be used for pegKeepers
          // Add job with retry strategy
          await this.liquidatorQueue.add(jobId, serializedAction, {
            priority,
            attempts: indexerConfig.liquidationQueue.attempts,
            backoff: {
              type: indexerConfig.liquidationQueue.backoff.type,
              delay: indexerConfig.liquidationQueue.backoff.delay,
            },
            removeOnComplete: true, // Remove completed jobs
            removeOnFail: false, // Keep failed jobs for inspection
          })
        }
      }

      if (notDebtorAnymoreList && notDebtorAnymoreList.length > 0) {
        try {
          await this.liquidationBotService.logCleanDebtors(notDebtorAnymoreList || null, this.context)
        } catch (e) {
          await this.liquidationBotService.logError("error", e as Error, this.context, { notDebtorAnymoreList }, false)
        }
      }

      console.log("Liquidation errors:", this.liquidationService.errors)
      console.log("Liquidation errors:", this.liquidationService.errors)

      // The end
      this.liquidationBotService.logEndExecution(this.context)
    } catch (e) {
      await this.liquidationBotService.logError(currentAction, e as Error, this.context)
      await this.telegramNotifierService.sendError(`Liquidation Error on ${currentAction}: ${(e as Error).message}`)

      throw e
    } finally {
      // Close the queue connection to allow the process to exit
      await this.liquidatorQueue.close()
    }
  }

  /**
   * Closes the queue connection
   * Should be called when done with the service
   */
  async close(): Promise<void> {
    await this.liquidatorQueue.close()
  }
}
