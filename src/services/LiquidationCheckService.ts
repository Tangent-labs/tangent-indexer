import { AddressLike, formatEther, formatUnits, JsonRpcProvider, parseEther } from "ethers"
import { Queue, type Queue as BullQueue } from "bullmq"
import { LiquidationService } from "./LiquidationService.js"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext.js"
import { LiquidationBotLogService } from "./LiquidationBotLogService.js"
import { LiquidationBotLogAction, LiquidationMarketAccountOutInfo, LiquidationUserInInfo, SerializedLiquidationUserFullInfo } from "../type/data.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"
import { prepareSerialize } from "../utils/jsonSerializer.js"
import { liquidationConfig } from "../config/liquidation_config.js"
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
    if (!liquidationConfig?.queueRedis?.trim()) {
      throw new Error("LIQUIDATION_QUEUE_REDIS is not configured. Please set the LIQUIDATION_QUEUE_REDIS environment variable.")
    }

    this.liquidatorQueue = new Queue<SerializedLiquidationUserFullInfo>("liquidatorQueue", {
      connection: liquidationConfig.queueRedis as any, // BullMQ accepts connection string
      defaultJobOptions: {
        attempts: liquidationConfig.queue.attempts,
        backoff: {
          type: "fixed",
          delay: liquidationConfig.queue.backoff.delay,
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
          attempts: liquidationConfig.queue.attempts,
          backoff: {
            type: "fixed",
            delay: liquidationConfig.queue.backoff.delay,
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
    const dbMarkets = await this.marketContractsRepository.getContracts()
    const marketAddressToId = new Map(dbMarkets.map((m) => [m.contract_address.toLowerCase(), m.id]))
    const now = new Date(Number(onChainData.blockTimestamp) * 1000)

    const snapshots = this.computePositionSnapshots(onChainData, borrowers, marketAddressToId, now)
    if (snapshots) await this.saveSnapshotsWithDedup(snapshots)
    await this.saveMarketConfigIfStale(onChainData, marketAddressToId, now)
  }

  private computePositionSnapshots(
    onChainData: LiquidationMarketAccountOutInfo,
    borrowers: LiquidationUserInInfo[],
    marketAddressToId: Map<string, bigint>,
    now: Date
  ) {
    return onChainData.accounts
      .map((accountData, index) => {
        const borrower = borrowers[index]
        if (!borrower) return null
        const marketId = marketAddressToId.get((accountData.market as string).toLowerCase())
        if (!marketId) return null

        const market = onChainData.markets.find((m) => (m.market as string).toLowerCase() === (accountData.market as string).toLowerCase())

        const userDebt = accountData.userDebt
        const positionValue = accountData.positionValue
        const collateralBalance = accountData.collateralBalance

        // LTV scaled by DENOMINATOR (100_000) for BigInt precision
        const ltvScaled = positionValue === 0n ? 0n : (userDebt * DENOMINATOR) / positionValue
        const ltv = Number(formatUnits(ltvScaled, 5))

        // CR (collateral ratio, inverse of LTV) — when debt=0, CR is Infinity
        const cr = userDebt === 0n ? 0 : Number(formatEther((positionValue * parseEther("1")) / userDebt))

        // Margin: distance from liquidation threshold (positive = safe)
        const liquidationThreshold = market?.liquidationThreshold ?? 0n
        const margin = Number(formatUnits(liquidationThreshold - ltvScaled, 5))

        const healthRatio = Number(formatEther(accountData.healthRatio))

        // Liquidation price & distance
        let liquidationPrice = 0
        let distancePct = 0

        if (market && collateralBalance > 0n && userDebt > 0n) {
          const oracleScale = 10n ** market.oracleDecimals

          // Price at which position becomes liquidatable
          const liqPriceBigInt = (userDebt * oracleScale * DENOMINATOR) / (collateralBalance * liquidationThreshold)
          liquidationPrice = Number(formatUnits(liqPriceBigInt, market.oracleDecimals))

          const currentPrice = Number(formatUnits(market.collateralUSDPrice, market.oracleDecimals))
          if (currentPrice > 0) {
            distancePct = ((currentPrice - liquidationPrice) / currentPrice) * 100
          }
        }

        return {
          market_id: marketId,
          borrower_address: (borrower.account as string).toLowerCase(),
          collateral_balance: Number(formatEther(collateralBalance)),
          position_value_usd: Number(formatEther(positionValue)),
          user_debt: Number(formatEther(userDebt)),
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
  }

  private async saveSnapshotsWithDedup(snapshots: ReturnType<typeof this.computePositionSnapshots>) {
    const latestSnapshots = await this.positionSnapshotRepository.getLatestSnapshotsWithin24h()
    const latestMap = new Map(latestSnapshots.map((s) => [`${s.market_id}-${s.borrower_address}`, s]))

    const changedSnapshots = snapshots.filter((s) => {
      const key = `${s.market_id}-${s.borrower_address}`
      const prev = latestMap.get(key)
      if (!prev) return true
      return (
        Math.abs(prev.user_debt - (s.user_debt as number)) > liquidationConfig.snapshotTolerance ||
        Math.abs(prev.position_value_usd - (s.position_value_usd as number)) > liquidationConfig.snapshotTolerance
      )
    })

    await this.positionSnapshotRepository.saveSnapshots(changedSnapshots)
  }

  // Save market config at most once per 24 hours per market
  private async saveMarketConfigIfStale(onChainData: LiquidationMarketAccountOutInfo, marketAddressToId: Map<string, bigint>, now: Date) {
    const allConfigs = onChainData.markets
      .map((m) => {
        const marketId = marketAddressToId.get((m.market as string).toLowerCase())
        if (!marketId) return null
        return {
          market_id: marketId,
          max_ltv: Number(formatUnits(m.maxLTV, 5)),
          liquidation_threshold: Number(formatUnits(m.liquidationThreshold, 5)),
          max_debt: Number(formatEther(m.maxMarketDebt)),
          last_update: now,
        }
      })
      .filter((c) => c !== null)

    if (!allConfigs.length) return

    const marketIds = allConfigs.map((c) => c.market_id)
    const lastUpdates = await this.marketConfigRepository.getLastUpdateByMarketIds(marketIds)

    const staleConfigs = allConfigs.filter((c) => {
      const lastUpdate = lastUpdates.get(c.market_id)
      return !lastUpdate || now.getTime() - lastUpdate.getTime() > ONE_DAY_IN_MSECONDS
    })

    if (staleConfigs.length) {
      await this.marketConfigRepository.saveMarketConfigs(staleConfigs)
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
