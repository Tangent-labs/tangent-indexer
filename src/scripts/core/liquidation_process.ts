import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"
import { Queue, Worker, type Job } from "bullmq"
import { Wallet, formatEther, parseEther } from "ethers"

import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository.js"
import { LiquidationBotLogRepository } from "../../db/LiquidationBotLogRepository.js"

import { LiquidationService } from "../../services/LiquidationService.js"
import { LiquidationBotLogService } from "../../services/LiquidationBotLogService.js"

import { indexerConfig } from "../../config/indexer_config.js"
import { LiquidationExecutionContext } from "../../services/LiquidationExecutionContext.js"
import { setUpIndexer } from "../../config/indexer_setup.js"
import { TelegramNotifierService } from "../../services/TelegramNotificationServices.js"
import { routers } from "@tangent/defi-resources"
import { SerializedLiquidationUserFullInfo } from "../type/data.js"
import { getBestRpcProvider } from "../utils/getBestRpcProvider.js"
import { RouterService } from "../services/RouterService.js"
import { getAddressesJson } from "../utils/jsonReader.js"

dotenv.config()

const { providers, walletsPks, handleError } = setUpIndexer()
const { liquidationService, context, telegramNotifierService } = await setUpLiquidationProcessServices()

// Export for testing
export { providers, context, telegramNotifierService }

// Map to store wallet states (wallet address -> state)
type WalletState = {
  available: boolean
  balance: bigint
  index: number
  address: string
  walletPk: string // Store walletPk for autoresume checks
}
const walletStates = new Map<string, WalletState>()

// Map to store workers (wallet address -> Worker)
const walletWorkers = new Map<string, Worker<SerializedLiquidationUserFullInfo>>()

// Export for testing
export { walletStates, walletWorkers }

// MIN_GAS constant - minimum ETH balance required for a wallet to process jobs
const MIN_GAS = indexerConfig.minEthBalance
const MIN_GAS_WEI = parseEther(MIN_GAS.toString())

/**
 * Check wallet balance and return true if balance is sufficient
 */
async function checkWalletBalance(walletPk: string): Promise<{ sufficient: boolean; balance: number; address: string }> {
  const { balance, address } = await getWalletBalance(walletPk)
  return { sufficient: balance >= MIN_GAS_WEI, balance: Number(formatEther(balance)), address }
}

/**
 * Filter wallets that have sufficient balance (> minEthBalance)
 */
async function filterWalletsWithSufficientBalance(walletPks: string[]): Promise<{ walletPk: string; index: number; address: string }[]> {
  const validWallets: { walletPk: string; index: number; address: string }[] = []

  for (let i = 0; i < walletPks.length; i++) {
    const walletPk = walletPks[i]
    const { sufficient, balance, address } = await checkWalletBalance(walletPk)

    if (sufficient) {
      validWallets.push({ walletPk, index: i, address })
    } else {
      console.error(`✗ Wallet ${i} (${address}): ${balance.toFixed(6)} ETH - INSUFFICIENT (skipping)`)
    }
  }

  return validWallets
}

/**
 * Get wallet balance
 */
async function getWalletBalance(walletPk: string): Promise<{ balance: bigint; address: string }> {
  const provider = providers[context.currentRpcIndex]
  const signer = new Wallet(walletPk, provider)
  const address = await signer.getAddress()
  const balance = await provider.getBalance(address)
  return { balance, address }
}

/**
 * Check and resume paused wallets that now have sufficient gas
 */
export async function checkAndResumePausedWallets() {
  const unavailableWallets = Array.from(walletStates.entries()).filter(([_, state]) => !state.available)

  if (unavailableWallets.length === 0) {
    return // No paused wallets to check
  }

  for (const [address, state] of unavailableWallets) {
    try {
      const { balance } = await getWalletBalance(state.walletPk)
      const balanceEth = Number(balance) / 10 ** 18

      if (balance >= MIN_GAS_WEI) {
        // Wallet has sufficient gas, resume it
        const worker = walletWorkers.get(address)
        if (worker) {
          await worker.resume()
          state.available = true
          state.balance = balance

          const resumeMsg = `Wallet ${address} resumed - gas replenished (balance: ${balanceEth.toFixed(6)} ETH, required: ${MIN_GAS} ETH)`
          await telegramNotifierService.sendError(resumeMsg) // Using sendError for notifications
        }
      } else {
        // Update balance but keep paused
        state.balance = balance
      }
    } catch (error) {
      console.error(`Error checking wallet ${address}:`, error)
    }
  }
}

/**
 * Main function to process the liquidation queue
 */
async function main() {
  console.log("Starting liquidation process queue worker...")

  // Validate liquidation queue Redis configuration
  if (!indexerConfig.liquidationQueueRedis || indexerConfig.liquidationQueueRedis.trim() === "") {
    const error = new Error("LIQUIDATION_QUEUE_REDIS is not configured. Please set the LIQUIDATION_QUEUE_REDIS environment variable.")
    console.error(error.message)
    await telegramNotifierService.sendError(`Liquidation Process Error: ${error.message}`)
    throw error
  }

  const liquidatorQueue = new Queue<SerializedLiquidationUserFullInfo>("liquidatorQueue", {
    connection: indexerConfig.liquidationQueueRedis as any, // BullMQ accepts connection string
    defaultJobOptions: {
      // Removed invalid lockDuration and lockRenewTime properties
      attempts: indexerConfig.liquidationQueue.attempts,
      backoff: {
        type: indexerConfig.liquidationQueue.backoff.type,
        delay: indexerConfig.liquidationQueue.backoff.delay,
      },
      removeOnComplete: true, // Remove completed jobs
      removeOnFail: false, // Keep failed jobs for inspection
    },
  })

  // Set up context
  context.providers = providers
  context.walletsPks = walletsPks

  // Check context (validate RPCs and wallets)
  try {
    await liquidationService.checkContext()
  } catch (error) {
    console.error("Failed to check context:", error)
    await telegramNotifierService.sendError(`Liquidation Process Error: Failed to check context: ${(error as Error).message}`)
    throw error
  }

  // Filter wallets with sufficient balance (> minEthBalance)
  const validWallets = await filterWalletsWithSufficientBalance(walletsPks)

  if (validWallets.length === 0) {
    const error = new Error(`No wallets with sufficient balance (> ${MIN_GAS} ETH) found`)
    console.error(error.message)
    await telegramNotifierService.sendError(`Liquidation Process Error: ${error.message}`)
    throw error
  }
  const invalidWallets = walletsPks.length - validWallets.length
  if (invalidWallets > 2) {
    await telegramNotifierService.sendError(`Liquidation Process Error:${invalidWallets} wallets with insufficient balance (> ${MIN_GAS} ETH) found`)
  }

  // Create one worker per wallet
  for (const { walletPk, index, address } of validWallets) {
    console.log(`Creating worker ${index + 1}/${validWallets.length} for wallet ${index} (${address})...`)

    // Initialize wallet state
    const { balance } = await getWalletBalance(walletPk)
    walletStates.set(address, {
      available: true,
      balance,
      index,
      address,
      walletPk,
    })

    // Create a worker for this specific wallet
    const worker = new Worker<SerializedLiquidationUserFullInfo>(
      "liquidatorQueue",
      async (job: Job<SerializedLiquidationUserFullInfo>, token, signal) => {
        // Handle cancellation when lock is lost
        return new Promise((resolve, reject) => {
          // Set up abort listener for graceful cancellation
          signal?.addEventListener("abort", () => {
            const reason = signal.reason || "Lock renewal failed"
            reject(new Error(`Job cancelled: ${reason}`))
          })

          // Execute async work
          ;(async () => {
            try {
              // ✅ Check for the best RPC provider at the start of each job
              const bestRpc = await getBestRpcProvider(providers)
              const rpcIndex = bestRpc.index
              const currentBlock = Number(bestRpc.blockNumber)

              // Pre-check before processing
              const state = walletStates.get(address)
              if (!state || !state.available) {
                throw new Error("Wallet not available") // Will retry with another worker
              }

              // Check if cancelled before processing
              if (signal?.aborted) {
                throw new Error("Job cancelled before processing")
              }

              const { balance: currentBalance } = await getWalletBalance(walletPk)
              if (currentBalance < MIN_GAS_WEI) {
                state.available = false
                state.balance = currentBalance

                await worker.pause()

                const balanceEth = Number(formatEther(currentBalance))
                const errorMsg = `Wallet ${address} paused - needs gas (balance: ${balanceEth.toFixed(6)} ETH, required: ${MIN_GAS} ETH)`
                console.error(errorMsg)
                await telegramNotifierService.sendError(errorMsg)

                throw new Error(`Wallet ${address} low gas`) // Job goes back to queue
              }

              // Check if cancelled before processing liquidation
              if (signal?.aborted) {
                throw new Error("Job cancelled before liquidation")
              }

              // Process liquidation (pass signal, rpcIndex, and currentBlock for cancellation support)
              await liquidationService.processJob(job, telegramNotifierService, walletPk, signal, rpcIndex, currentBlock)

              // Check if cancelled after processing
              if (signal?.aborted) {
                throw new Error("Job cancelled after processing")
              }

              // Update state
              const { balance: updatedBalance } = await getWalletBalance(walletPk)
              state.balance = updatedBalance

              // Wait 200ms before processing next job to avoid overwhelming the RPC
              await new Promise((resolve) => setTimeout(resolve, 200))

              resolve(undefined)
            } catch (error) {
              reject(error)
            }
          })()
        })
      },
      {
        connection: indexerConfig.liquidationQueueRedis as any, // BullMQ accepts connection string
        concurrency: 1, // 1 job at a time per worker
        lockDuration: 10 * 60 * 1000, // 10 minutes lock duration (liquidations can take time)
        lockRenewTime: 30 * 1000, // Renew lock every 30 seconds to prevent expiration
      }
    )

    walletWorkers.set(address, worker)
  }

  // Handle worker events (attach to all workers)
  // for (const [address, worker] of walletWorkers.entries()) {
  //   worker.on("failed", async (job: Job<SerializedLiquidationUserFullInfo> | undefined, error: Error) => {
  //     if (!job) {
  //       return
  //     }

  //     const attemptsMade = job.attemptsMade || 0
  //     const maxAttempts = job.opts?.attempts || indexerConfig.liquidationQueue.attempts

  //     // Check if job will be retried
  //     if (attemptsMade < maxAttempts) {
  //       const nextAttempt = attemptsMade + 1

  //       await telegramNotifierService.sendError(
  //         `Liquidation Process: Job ${job.id} failed and will be retried (attempt ${nextAttempt}/${maxAttempts}). Error: ${error.message}`
  //       )
  //     } else {
  //       // Job has exhausted all retry attempts

  //       await telegramNotifierService.sendError(
  //         `Liquidation Process: Job ${job.id} has permanently failed after ${maxAttempts} attempts. Error: ${error.message}`
  //       )
  //     }
  //   })

  //   // worker.on("error", (error: Error) => {
  //   //   console.error(`Worker error for wallet ${address}:`, error)
  //   //   telegramNotifierService.sendError(`Liquidation Process Worker Error (${address}): ${error.message}`)
  //   // })

  //   // Handle lock renewal failures - cancel jobs when lock is lost
  //   // This allows graceful cleanup and lets BullMQ's stalled job checker retry the job
  //   worker.on("lockRenewalFailed", (jobIds: string[]) => {
  //     console.warn(`Lock renewal failed for ${jobIds.length} job(s) on wallet ${address}:`, jobIds)
  //     jobIds.forEach((jobId) => {
  //       worker.cancelJob(jobId, "Lock renewal failed - will be retried by stalled job checker")
  //     })
  //   })
  // }

  // // Handle queue events
  // liquidatorQueue.on("error", (error: Error) => {
  //   console.error("Queue error:", error)
  //   telegramNotifierService.sendError(`Liquidation Process Queue Error: ${error.message}`)
  // })

  // Auto-resume interval: check paused wallets every 5 minutes
  const AUTO_RESUME_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
  const autoResumeInterval = setInterval(() => {
    checkAndResumePausedWallets().catch((error) => {
      console.error("Error in auto-resume check:", error)
    })
  }, AUTO_RESUME_INTERVAL_MS)

  // Graceful shutdown handler
  const gracefulShutdown = async () => {
    console.log("Shutting down gracefully...")
    // Clear auto-resume interval
    clearInterval(autoResumeInterval)
    // Close all workers
    for (const [, worker] of walletWorkers.entries()) {
      await worker.close()
    }
    await liquidatorQueue.close()
    process.exit(0)
  }

  process.on("SIGTERM", gracefulShutdown)
  process.on("SIGINT", gracefulShutdown)

  // Keep the process alive
  console.log("Queue worker is running. Waiting for jobs...")
}

// Run main function if this file is being run directly
if (process.env.NODE_ENV !== "test") {
  main()
    .then(() => {
      console.log("Liquidation process worker started")
    })
    .catch((error) => {
      console.error("Failed to start liquidation process worker:", error)
      handleError(error)
      process.exit(1)
    })
}

export async function setUpLiquidationProcessServices() {
  const prismaClient = new PrismaClient()
  const addresses = await getAddressesJson()

  const context = new LiquidationExecutionContext()
  context.providers = providers
  context.walletsPks = walletsPks
  const telegramNotifierService = new TelegramNotifierService({
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  })
  const liquidationBotLogRepository = new LiquidationBotLogRepository(prismaClient)
  const liquidationBotService = new LiquidationBotLogService(liquidationBotLogRepository, telegramNotifierService)
  const routerService = new RouterService(providers, routers.CURVE_V1_2_ROUTER, addresses.utilities.pendlePTRouter)

  const liquidationService = new LiquidationService(new ActiveBorrowersRepository(prismaClient), context, routerService, liquidationBotService)
  liquidationService.minEthBalance = indexerConfig.minEthBalance

  return {
    liquidationService,
    context,
    liquidationBotService,
    telegramNotifierService,
  }
}
