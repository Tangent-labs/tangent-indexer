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
  public marketViewerAddress?: string

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
      const onChainData = await this.liquidationService.getOnchainData(this.providers, markets, borrowers, this.marketViewerAddress as string)
      await this.liquidationBotService.logOnchainData(onChainData || null, this.context)
      if (!onChainData) {
        await this.telegramNotifierService.sendError(`Liquidation Error on ${currentAction}: No on chain data `)
        return
      }

      // Count accounts with debt

      currentAction = "liquidation_analysis"
      const { seizingList, liquidationList } = await this.liquidationService.analyzeLiquidation(onChainData, borrowers)

      await this.liquidationBotService.logLiquidationAnalysis({ seizingList, liquidationList }, this.context)

      // Early return if no liquidations found
      const hasSeizing = seizingList && seizingList.length > 0
      const hasLiquidation = liquidationList && liquidationList.length > 0
      if (!hasSeizing && !hasLiquidation) {
        await this.liquidationBotService.logEndExecution(this.context)
        return
      }

      currentAction = "liquidation_prioritization"
      const prioritizedLiquidationList = this.liquidationService.prioritizeActions(seizingList || [], liquidationList || [])

      currentAction = "liquidation_execution"

      // Double-check that we have items to process before adding to queue
      if (!prioritizedLiquidationList || prioritizedLiquidationList.length === 0) {
        await this.liquidationBotService.logEndExecution(this.context)
        return
      }

      for (const action of prioritizedLiquidationList) {
        const jobId = `${action.market}-${action.account}-${action.type}`
        // Serialize BigInt values to strings for queue storage
        const serializedAction = {
          ...(prepareSerialize(action) as SerializedLiquidationUserFullInfo),
          executionKey: this.context.executionKey,
        } as SerializedLiquidationUserFullInfo
        const priority = action.type === "liquidation" ? 2 : 3 // less priority means processed first , so liquidation are processed first
        // 1 will be used for pegKeepers

        // Check if job already exists
        const existingJob = await this.liquidatorQueue.getJob(jobId)
        if (existingJob) {
          const state = await existingJob.getState()
          const attemptsMade = existingJob.attemptsMade || 0

          // If job is active (being processed), skip update
          if (state === "active") {
            continue
          }

          // If job has been attempted, preserve it (don't update) to keep attempts count
          if (attemptsMade > 0) {
            continue
          }

          // Job exists but hasn't been attempted yet - safe to update
          await existingJob.remove()
        }

        // Add job with retry strategy
        // Using jobId in options per BullMQ docs: https://docs.bullmq.io/guide/jobs/job-ids
        // This ensures proper deduplication - if a job with the same id exists, it will be ignored
        await this.liquidatorQueue.add("liquidation", serializedAction, {
          jobId,
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

      // The end
      await this.liquidationBotService.logEndExecution(this.context)
    } catch (e) {
      await this.liquidationBotService.logError(currentAction, e as Error, this.context, undefined, true)
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
