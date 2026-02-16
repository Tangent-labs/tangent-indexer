import { AddressLike, JsonRpcProvider } from "ethers"
import { Queue, type Queue as BullQueue } from "bullmq"
import { LiquidationService } from "./LiquidationService.js"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext.js"
import { LiquidationBotLogService } from "./LiquidationBotLogService.js"
import { LiquidationBotLogAction, LiquidationMarketAccountOutInfo, LiquidationUserInInfo, SerializedLiquidationUserFullInfo } from "../type/data.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"
import { prepareSerialize } from "../utils/jsonSerializer.js"
import { indexerConfig } from "../config/indexer_config.js"
import { PositionSnapshotRepository } from "../db/PositionSnapshotRepository.js"
import { MarketConfigRepository } from "../db/MarketConfigRepository.js"
import { MarketContractsRepository } from "../db/MarketContractsRepository.js"

const DENOMINATOR = 100_000n
const ONE_DAY_IN_MSECONDS = 24 * 60 * 60 * 1000

export class CheckLiquidationService {
  private liquidationService: LiquidationService
  private context: LiquidationExecutionContext
  private liquidationBotService: LiquidationBotLogService
  private telegramNotifierService: TelegramNotifierService
  private providers: JsonRpcProvider[]
  private liquidatorQueue: BullQueue<SerializedLiquidationUserFullInfo>
  private positionSnapshotRepository: PositionSnapshotRepository
  private marketConfigRepository: MarketConfigRepository
  private marketContractsRepository: MarketContractsRepository
  public marketViewerAddress?: string

  constructor(
    liquidationService: LiquidationService,
    context: LiquidationExecutionContext,
    liquidationBotService: LiquidationBotLogService,
    telegramNotifierService: TelegramNotifierService,
    providers: JsonRpcProvider[],
    positionSnapshotRepository: PositionSnapshotRepository,
    marketConfigRepository: MarketConfigRepository,
    marketContractsRepository: MarketContractsRepository
  ) {
    this.liquidationService = liquidationService
    this.context = context
    this.liquidationBotService = liquidationBotService
    this.telegramNotifierService = telegramNotifierService
    this.providers = providers
    this.positionSnapshotRepository = positionSnapshotRepository
    this.marketConfigRepository = marketConfigRepository
    this.marketContractsRepository = marketContractsRepository

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

      // Save position snapshots and market config (non-blocking for liquidation flow)
      if (this.context.isDbAlive) {
        try {
          await this.saveSnapshotsAndConfig(onChainData, borrowers)
        } catch (e) {
          await this.liquidationBotService.logError(currentAction, e as Error, this.context, {}, false)
          console.warn("Failed to save position snapshots/market config:", (e as Error).message)
        }
      }

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

  private async saveSnapshotsAndConfig(onChainData: LiquidationMarketAccountOutInfo, borrowers: LiquidationUserInInfo[]) {
    // Build market address → market_id mapping
    const dbMarkets = await this.marketContractsRepository.getContracts()
    const marketAddressToId = new Map(dbMarkets.map((m) => [m.contract_address.toLowerCase(), m.id]))

    const now = new Date()

    // Save position snapshots
    const snapshots = onChainData.accounts
      .map((accountData, index) => {
        const borrower = borrowers[index]
        if (!borrower) return null
        const marketId = marketAddressToId.get((accountData.market as string).toLowerCase())
        if (!marketId) return null

        const market = onChainData.markets.find((m) => (m.market as string).toLowerCase() === (accountData.market as string).toLowerCase())

        const userDebt = accountData.userDebt
        const positionValue = accountData.positionValue
        const collateralBalance = accountData.collateralBalance

        // LTV as ratio (e.g. 0.75)
        const ltv = positionValue === 0n ? 0 : Number((userDebt * 10_000n) / positionValue) / 10_000

        // CR (collateral ratio, inverse of LTV)
        const cr = userDebt === 0n ? 0 : Number((positionValue * 10_000n) / userDebt) / 10_000

        // Margin: distance from liquidation threshold (positive = safe)
        const ltvScaled = positionValue === 0n ? 0n : (userDebt * DENOMINATOR) / positionValue
        const liquidationThreshold = market?.liquidationThreshold ?? 0n
        const margin = Number(liquidationThreshold - ltvScaled) / Number(DENOMINATOR)

        const healthRatio = Math.round((Number(accountData.healthRatio) / 1e18) * 1e6) / 1e6

        // Liquidation price & distance
        let liquidationPrice = 0
        let distancePct = 0

        if (market && collateralBalance > 0n && userDebt > 0n) {
          const oracleScale = 10n ** BigInt(Number(market.oracleDecimals))

          // Price at which position becomes liquidatable
          const liqPriceBigInt = (userDebt * oracleScale * DENOMINATOR) / (collateralBalance * liquidationThreshold)
          liquidationPrice = Number(liqPriceBigInt) / Number(oracleScale)

          const currentPrice = Number(market.collateralUSDPrice) / Number(oracleScale)
          if (currentPrice > 0) {
            distancePct = ((currentPrice - liquidationPrice) / currentPrice) * 100
          }
        }

        return {
          market_id: marketId,
          borrower_address: (borrower.account as string).toLowerCase(),
          collateral_balance: Number(collateralBalance) / 1e18,
          position_value_usd: Math.round((Number(positionValue) / 1e18) * 100) / 100,
          user_debt: Math.round((Number(userDebt) / 1e18) * 100) / 100,
          ltv,
          cr,
          margin,
          health_ratio: healthRatio,
          liquidation_price: liquidationPrice,
          distance_pct: distancePct,
          snapshot_timestamp: now,
        }
      })
      .filter((s) => s !== null)

    // MArket config -----------------------------

    await this.positionSnapshotRepository.saveSnapshots(snapshots)

    const lastUpdate = await this.marketConfigRepository.getLastUpdateDate()
    //  1 save each  24 hours max
    if (!lastUpdate?.last_update || now.getTime() - lastUpdate.last_update.getTime() > ONE_DAY_IN_MSECONDS) {
      // Save market configs
      const marketConfigs = onChainData.markets
        .map((m) => {
          const marketId = marketAddressToId.get((m.market as string).toLowerCase())
          if (!marketId) return null
          return {
            market_id: marketId,
            max_ltv: Number(m.maxLTV) / Number(DENOMINATOR),
            liquidation_threshold: Number(m.liquidationThreshold) / Number(DENOMINATOR),
            max_debt: Number(m.maxMarketDebt / 10n ** 18n),
            last_update: now,
          }
        })
        .filter((c) => c !== null)

      await this.marketConfigRepository.saveMarketConfigs(marketConfigs)
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
