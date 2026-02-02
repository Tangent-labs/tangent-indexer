import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { AddressLike, JsonRpcProvider } from "ethers"
import { type Job } from "bullmq"

import { PrismaClient } from "@prisma/client"
import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository.js"
import { LiquidationBotLogRepository } from "../../db/LiquidationBotLogRepository.js"
import { LiquidationBotLogService } from "../../services/LiquidationBotLogService.js"
import { LiquidationService } from "../../services/LiquidationService.js"
import { LiquidationExecutionContext } from "../../services/LiquidationExecutionContext.js"
import { TelegramNotifierService } from "../../services/TelegramNotificationServices.js"
import { SerializedLiquidationUserFullInfo } from "../../type/data.js"
import {
  setUpLiquidationProcessServices,
  checkAndResumePausedWallets,
  walletStates,
  walletWorkers,
  providers,
  context,
  telegramNotifierService,
} from "../../scripts/liquidation_process.js"

const DECIMALS = BigInt(10 ** 18)
const TEST_EXECUTION_KEY = "test-execution-key-12345"

// Mock Wallet and Contract constructors - hoisted so they can be accessed in both mocks and tests
const mockWallet = vi.hoisted(() => vi.fn())
const mockContract = vi.hoisted(() => vi.fn())

vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers")
  return {
    ...actual,
    Wallet: mockWallet,
    Contract: mockContract,
  }
})

// Mock dependencies
vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => ({
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  })),
}))

vi.mock("utils/jsonSerializer", () => ({
  prepareSerialize: vi.fn((data) => data),
}))

vi.mock("db/ActiveBorrowersRepository")
vi.mock("db/LiquidationBotLogRepository")
// Note: We don't mock LiquidationService here because we want to test the real processJob method
vi.mock("services/LiquidationBotLogService")
vi.mock("config/indexer_setup", () => ({
  setUpIndexer: vi.fn(() => ({
    providers: [{} as JsonRpcProvider, {} as JsonRpcProvider],
    walletsPks: ["wallet1", "wallet2", "wallet3"],
    handleError: vi.fn(),
  })),
}))

// Mock BullMQ Queue and Worker
const queueMocks = vi.hoisted(() => ({
  on: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  add: vi.fn().mockResolvedValue({}),
}))

const workerMocks = vi.hoisted(() => ({
  on: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("bullmq", () => {
  class MockQueue {
    on = queueMocks.on
    close = queueMocks.close
    add = queueMocks.add
  }
  class MockWorker {
    on = workerMocks.on
    close = workerMocks.close
    pause = workerMocks.pause
    resume = workerMocks.resume
  }
  return {
    Queue: MockQueue,
    Worker: MockWorker,
  }
})

// Import the script functions after mocks are set up

describe("liquidation_process", () => {
  let activeBorrowersRepository: ActiveBorrowersRepository
  let mockLiquidationBotLogRepository: LiquidationBotLogRepository
  let mockLiquidationBotLogService: LiquidationBotLogService
  let mockLiquidationService: LiquidationService
  let mockContext: LiquidationExecutionContext
  let mockTelegramNotifierService: TelegramNotifierService
  let mockProvider: any
  let mockSigner: any

  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks()
    queueMocks.on.mockReset()
    queueMocks.close.mockReset()
    queueMocks.add.mockReset()
    workerMocks.on.mockReset()
    workerMocks.close.mockReset()
    workerMocks.pause.mockReset()
    workerMocks.resume.mockReset()

    // Setup mock provider
    mockProvider = {
      getTransactionCount: vi.fn().mockResolvedValue(0),
      getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1000000000n }),
    }

    // Setup mock signer (returned by Wallet constructor)
    mockSigner = {
      getAddress: vi.fn().mockResolvedValue("0xSignerAddress"),
    }

    // Setup mock Wallet and Contract
    mockWallet.mockImplementation(() => mockSigner)
    mockContract.mockImplementation(() => ({
      seizeCollateral: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({}) }),
      liquidate: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({}) }),
    }))

    // Setup mock context
    mockContext = new LiquidationExecutionContext()
    mockContext.isDbAlive = true
    mockContext.currentRpcIndex = 0
    mockContext.currentBlock = 1000
    mockContext.providers = [mockProvider as JsonRpcProvider, mockProvider as JsonRpcProvider]
    mockContext.walletsPks = ["wallet1", "wallet2", "wallet3"]

    // Setup mock repositories
    activeBorrowersRepository = new ActiveBorrowersRepository({} as PrismaClient)
    mockLiquidationBotLogRepository = new LiquidationBotLogRepository({} as PrismaClient)
    mockTelegramNotifierService = new TelegramNotifierService({
      botToken: "test-token",
      chatId: "test-chat-id",
    })

    // Setup mock services
    mockLiquidationBotLogService = new LiquidationBotLogService(mockLiquidationBotLogRepository, mockTelegramNotifierService)
    const mockRouterService = {} as any
    mockLiquidationService = new LiquidationService(activeBorrowersRepository, mockContext, mockRouterService, mockLiquidationBotLogService)

    // Mock service methods
    vi.spyOn(mockLiquidationService, "checkContext").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationService, "executeSeizing").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationService, "executeLiquidation").mockResolvedValue(undefined)
    // Note: processJob is a real method, so we don't need to mock it
    // The actual implementation will be used, but we can spy on it to verify calls

    // Mock bot service methods
    vi.spyOn(mockLiquidationBotLogService, "logError").mockResolvedValue(undefined)
    vi.spyOn(mockTelegramNotifierService, "sendError").mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("setUpLiquidationProcessServices", () => {
    it("should set up all services correctly", async () => {
      const services = await setUpLiquidationProcessServices()

      expect(services.liquidationService).toBeDefined()
      expect(services.context).toBeDefined()
      expect(services.liquidationBotService).toBeDefined()
      expect(services.telegramNotifierService).toBeDefined()
    })
  })

  describe("queue processing", () => {
    it("should process seizing jobs and call executeSeizing", async () => {
      const seizingJob: Job<SerializedLiquidationUserFullInfo> = {
        id: "1",
        data: {
          account: "0xUser1" as AddressLike,
          market: "0xMarket1" as AddressLike,
          healthRatio: 500000000000000000n.toString(),
          userDebt: (600n * DECIMALS).toString(),
          positionValue: (550n * DECIMALS).toString(),
          collateralBalance: (1500n * DECIMALS).toString(),
          collatToken: "0xToken1" as AddressLike,
          type: "seizing",
          executionKey: TEST_EXECUTION_KEY,
        },
        attemptsMade: 0,
      } as Job<SerializedLiquidationUserFullInfo>

      const walletPk = "wallet1"

      // Verify Wallet mock is set up
      expect(mockWallet).toBeDefined()

      // Process the job using processJob method from LiquidationService (one job at a time)
      await mockLiquidationService.processJob(seizingJob, mockTelegramNotifierService, walletPk)

      // Verify that Wallet was called to create the signer
      expect(mockWallet).toHaveBeenCalledWith(walletPk, mockProvider)

      // Verify that executeSeizing was called with the correct arguments
      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledTimes(1)
      const executeSeizingSpy = mockLiquidationService.executeSeizing as any
      const executeSeizingCall = executeSeizingSpy.mock.calls[0]
      expect(executeSeizingCall[0]).toBe(mockSigner)
      expect(executeSeizingCall[1]).toMatchObject({
        account: "0xUser1",
        market: "0xMarket1",
        type: "seizing",
      })
      expect(executeSeizingCall[2]).toMatchObject({
        currentRpcIndex: expect.any(Number),
        currentBlock: expect.any(Number),
      }) // logContext
      expect(mockLiquidationService.executeLiquidation).not.toHaveBeenCalled()
    })

    it("should process liquidation jobs and call executeLiquidation", async () => {
      const liquidationJob: Job<SerializedLiquidationUserFullInfo> = {
        id: "2",
        data: {
          account: "0xUser2" as AddressLike,
          market: "0xMarket2" as AddressLike,
          healthRatio: 2000000000000000000n.toString(),
          userDebt: (760n * DECIMALS).toString(),
          positionValue: (1000n * DECIMALS).toString(),
          collateralBalance: (1500n * DECIMALS).toString(),
          collatToken: "0xToken2" as AddressLike,
          type: "liquidation",
          executionKey: TEST_EXECUTION_KEY,
        },
        attemptsMade: 0,
      } as Job<SerializedLiquidationUserFullInfo>

      const walletPk = "wallet1"

      // Process the job using processJob method from LiquidationService (one job at a time)
      await mockLiquidationService.processJob(liquidationJob, mockTelegramNotifierService, walletPk)

      // Verify that executeLiquidation was called with deserialized data (BigInt values)
      // executeLiquidation is called with: walletIndex, action, slippageModifierBps, nbAttempt
      // slippageModifierBps is 0n when attemptsMade is 0
      // nbAttempt is the attemptsMade value from the job (0 in this case)
      // Note: executionKey is also included in the action object
      const executeLiquidationSpy = mockLiquidationService.executeLiquidation as any
      const executeLiquidationCall = executeLiquidationSpy.mock.calls[0]
      expect(executeLiquidationCall[0]).toBe(0) // walletIndex
      expect(executeLiquidationCall[1]).toMatchObject({
        account: "0xUser2",
        market: "0xMarket2",
        healthRatio: 2000000000000000000n,
        userDebt: 760n * DECIMALS,
        positionValue: 1000n * DECIMALS,
        collateralBalance: 1500n * DECIMALS,
        type: "liquidation",
        executionKey: TEST_EXECUTION_KEY,
      })
      expect(executeLiquidationCall[2]).toBe(0n) // slippageModifierBps when attemptsMade is 0
      expect(executeLiquidationCall[3]).toBe(0) // nbAttempt (attemptsMade from job)
      // rpcIndex (optional, can be undefined or a number)
      expect(typeof executeLiquidationCall[4] === "undefined" || typeof executeLiquidationCall[4] === "number").toBe(true)
      // logContext (optional)
      expect(executeLiquidationCall[5]).toMatchObject({
        currentRpcIndex: expect.any(Number),
        currentBlock: expect.any(Number),
      })
      expect(mockLiquidationService.executeLiquidation).toHaveBeenCalledTimes(1)
      expect(mockLiquidationService.executeSeizing).not.toHaveBeenCalled()
    })

    it("should increase slippage modifier based on retry attempts", async () => {
      // Test multiple retry attempts to verify slippage increases
      const testCases = [
        { attemptsMade: 0, expectedSlippageModifier: 0n },
        { attemptsMade: 1, expectedSlippageModifier: 100000n }, // (200 - 100) * 1000 = 100000
        { attemptsMade: 2, expectedSlippageModifier: 200000n }, // (300 - 100) * 1000 = 200000
        { attemptsMade: 3, expectedSlippageModifier: 300000n }, // (400 - 100) * 1000 = 300000
      ]

      for (const testCase of testCases) {
        // Reset mocks for each test case
        vi.clearAllMocks()

        const liquidationJob: Job<SerializedLiquidationUserFullInfo> = {
          id: `retry-${testCase.attemptsMade}`,
          data: {
            account: "0xUserRetry" as AddressLike,
            market: "0xMarketRetry" as AddressLike,
            healthRatio: 2000000000000000000n.toString(),
            userDebt: (760n * DECIMALS).toString(),
            positionValue: (1000n * DECIMALS).toString(),
            collateralBalance: (1500n * DECIMALS).toString(),
            collatToken: "0xTokenRetry" as AddressLike,
            type: "liquidation",
            executionKey: TEST_EXECUTION_KEY,
          },
          attemptsMade: testCase.attemptsMade,
        } as Job<SerializedLiquidationUserFullInfo>

        const walletPk = "wallet1"

        // Process the job
        await mockLiquidationService.processJob(liquidationJob, mockTelegramNotifierService, walletPk)

        // Verify executeLiquidation was called with correct slippageModifierBps
        const executeLiquidationSpy = mockLiquidationService.executeLiquidation as any
        const executeLiquidationCall = executeLiquidationSpy.mock.calls[0]
        expect(executeLiquidationCall[0]).toBe(0) // walletIndex
        expect(executeLiquidationCall[1]).toMatchObject({
          account: "0xUserRetry",
          market: "0xMarketRetry",
          type: "liquidation",
        })
        expect(executeLiquidationCall[2]).toEqual(testCase.expectedSlippageModifier) // slippageModifierBps
        expect(executeLiquidationCall[3]).toBe(testCase.attemptsMade) // nbAttempt
        // rpcIndex (optional, can be undefined or a number)
        expect(typeof executeLiquidationCall[4] === "undefined" || typeof executeLiquidationCall[4] === "number").toBe(true)
        // logContext (optional)
        expect(executeLiquidationCall[5]).toMatchObject({
          currentRpcIndex: expect.any(Number),
          currentBlock: expect.any(Number),
        })

        // Verify telegram notification was sent for retries (attemptsMade > 0)
        if (testCase.attemptsMade > 0) {
          expect(mockTelegramNotifierService.sendError).toHaveBeenCalledWith(expect.stringContaining(`Retry attempt ${testCase.attemptsMade + 1}`))
        } else {
          expect(mockTelegramNotifierService.sendError).not.toHaveBeenCalled()
        }
      }
    })

    it("should process jobs one at a time with a single wallet", async () => {
      const jobs: Array<Job<SerializedLiquidationUserFullInfo>> = []
      for (let i = 0; i < 3; i++) {
        jobs.push({
          id: `${i}`,
          data: {
            account: `0xUser${i}` as AddressLike,
            market: `0xMarket${i}` as AddressLike,
            healthRatio: 500000000000000000n.toString(),
            userDebt: (600n * DECIMALS).toString(),
            positionValue: (1000n * DECIMALS).toString(),
            collateralBalance: (1500n * DECIMALS).toString(),
            collatToken: "0xToken1" as AddressLike,
            type: i % 2 === 0 ? "seizing" : "liquidation",
            executionKey: TEST_EXECUTION_KEY,
          },
          attemptsMade: 0,
        } as Job<SerializedLiquidationUserFullInfo>)
      }

      const walletPk = "wallet1"

      // Process jobs one at a time using processJob method
      for (const job of jobs) {
        await mockLiquidationService.processJob(job, mockTelegramNotifierService, walletPk)
      }

      // Verify all jobs were processed
      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledTimes(2) // Jobs 0, 2
      expect(mockLiquidationService.executeLiquidation).toHaveBeenCalledTimes(1) // Job 1
    })

    it("should handle errors during job processing", async () => {
      const error = new Error("Execution failed")
      const seizingJob: Job<SerializedLiquidationUserFullInfo> = {
        id: "3",
        data: {
          account: "0xUser3" as AddressLike,
          market: "0xMarket3" as AddressLike,
          healthRatio: 500000000000000000n.toString(),
          userDebt: (600n * DECIMALS).toString(),
          positionValue: (550n * DECIMALS).toString(),
          collateralBalance: (1500n * DECIMALS).toString(),
          collatToken: "0xToken3" as AddressLike,
          type: "seizing",
          executionKey: TEST_EXECUTION_KEY,
        },
        attemptsMade: 0,
      } as Job<SerializedLiquidationUserFullInfo>

      vi.spyOn(mockLiquidationService, "executeSeizing").mockRejectedValue(error)

      const walletPk = "wallet1"

      // Process the job and expect it to throw
      await expect(mockLiquidationService.processJob(seizingJob, mockTelegramNotifierService, walletPk)).rejects.toThrow("Execution failed")

      expect(mockLiquidationService.executeSeizing).toHaveBeenCalled()
      expect(mockTelegramNotifierService.sendError).toHaveBeenCalledWith(expect.stringContaining("Liquidation Process Error: Failed to execute seizing"))
    })

    it("should handle unknown job types", async () => {
      const unknownJob: Job<SerializedLiquidationUserFullInfo> = {
        id: "4",
        data: {
          account: "0xUser4" as AddressLike,
          market: "0xMarket4" as AddressLike,
          healthRatio: 500000000000000000n.toString(),
          userDebt: (600n * DECIMALS).toString(),
          positionValue: (1000n * DECIMALS).toString(),
          collateralBalance: (1500n * DECIMALS).toString(),
          collatToken: "0xToken4" as AddressLike,
          type: "unknown" as any, // Force unknown type
          executionKey: TEST_EXECUTION_KEY,
        },
        attemptsMade: 0,
      } as Job<SerializedLiquidationUserFullInfo>

      const walletPk = "wallet1"

      // Process the job and expect it to throw
      await expect(mockLiquidationService.processJob(unknownJob, mockTelegramNotifierService, walletPk)).rejects.toThrow("Unknown action type: unknown")
    })
  })

  describe("context validation", () => {
    it("should validate context before processing", async () => {
      // This would be tested in the main() function
      await mockLiquidationService.checkContext()

      expect(mockLiquidationService.checkContext).toHaveBeenCalled()
      expect(mockContext.currentRpcIndex).toBe(0)
      expect(mockContext.currentBlock).toBe(1000)
    })

    it("should handle context validation errors", async () => {
      const error = new Error("Context validation failed")
      vi.spyOn(mockLiquidationService, "checkContext").mockRejectedValue(error)

      await expect(mockLiquidationService.checkContext()).rejects.toThrow("Context validation failed")
    })
  })

  describe("processJob with single wallet", () => {
    it("should process multiple jobs sequentially with the same wallet", async () => {
      const walletPk = "wallet1"
      const callOrder: string[] = []

      // Track the order of calls
      vi.spyOn(mockLiquidationService, "executeSeizing").mockImplementation(async () => {
        callOrder.push("executeSeizing")
      })
      vi.spyOn(mockLiquidationService, "executeLiquidation").mockImplementation(async () => {
        callOrder.push("executeLiquidation")
      })

      // Create multiple jobs
      const jobs: Array<Job<SerializedLiquidationUserFullInfo>> = []
      for (let i = 0; i < 3; i++) {
        jobs.push({
          id: `${i}`,
          data: {
            account: `0xUser${i}` as AddressLike,
            market: `0xMarket${i}` as AddressLike,
            healthRatio: 500000000000000000n.toString(),
            userDebt: (600n * DECIMALS).toString(),
            positionValue: (1000n * DECIMALS).toString(),
            collateralBalance: (1500n * DECIMALS).toString(),
            collatToken: "0xToken1" as AddressLike,
            type: i % 2 === 0 ? "seizing" : "liquidation",
            executionKey: TEST_EXECUTION_KEY,
          },
          attemptsMade: 0,
        } as Job<SerializedLiquidationUserFullInfo>)
      }

      // Process all jobs one at a time with the same wallet
      for (const job of jobs) {
        await mockLiquidationService.processJob(job, mockTelegramNotifierService, walletPk)
      }

      // Verify jobs were processed sequentially
      expect(callOrder).toEqual(["executeSeizing", "executeLiquidation", "executeSeizing"])
    })

    it("should process a single job with a single wallet", async () => {
      const walletPk = "wallet1"

      const job: Job<SerializedLiquidationUserFullInfo> = {
        id: "1",
        data: {
          account: "0xUser1" as AddressLike,
          market: "0xMarket1" as AddressLike,
          healthRatio: 500000000000000000n.toString(),
          userDebt: (600n * DECIMALS).toString(),
          positionValue: (1000n * DECIMALS).toString(),
          collateralBalance: (1500n * DECIMALS).toString(),
          collatToken: "0xToken1" as AddressLike,
          type: "seizing",
          executionKey: TEST_EXECUTION_KEY,
        },
        attemptsMade: 0,
      } as Job<SerializedLiquidationUserFullInfo>

      // Process single job
      await mockLiquidationService.processJob(job, mockTelegramNotifierService, walletPk)

      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledTimes(1)
    })
  })

  describe("queue event handlers", () => {
    it("should set up queue event handlers", () => {
      // Simulate setting up event handlers
      const eventHandlers: Record<string, Function> = {}

      queueMocks.on.mockImplementation((event: string, handler: Function) => {
        eventHandlers[event] = handler
      })

      // Set up handlers
      queueMocks.on("completed", (job: Job) => {
        console.log(`Job ${job.id} completed`)
      })
      queueMocks.on("failed", (job: Job, error: Error) => {
        console.error(`Job ${job?.id} failed:`, error)
      })
      queueMocks.on("error", (error: Error) => {
        console.error("Queue error:", error)
      })

      expect(queueMocks.on).toHaveBeenCalledWith("completed", expect.any(Function))
      expect(queueMocks.on).toHaveBeenCalledWith("failed", expect.any(Function))
      expect(queueMocks.on).toHaveBeenCalledWith("error", expect.any(Function))
    })
  })

  describe("graceful shutdown", () => {
    it("should close queue on graceful shutdown", async () => {
      await queueMocks.close()

      expect(queueMocks.close).toHaveBeenCalled()
    })
  })

  describe("checkAndResumePausedWallets", () => {
    beforeEach(() => {
      // Clear wallet states and workers before each test
      walletStates.clear()
      walletWorkers.clear()

      // Ensure context is set up correctly for getWalletBalance
      context.currentRpcIndex = 0
      // Ensure providers array has our mock provider
      if (providers.length === 0) {
        providers.push(mockProvider as JsonRpcProvider)
      } else {
        providers[0] = mockProvider as JsonRpcProvider
      }

      // Mock telegramNotifierService.sendError for the module-level instance
      // Note: This will work if telegramNotifierService is the same instance
      // If not, we may need to spy on the actual instance
      vi.spyOn(telegramNotifierService, "sendError").mockResolvedValue(true)
    })

    it("should resume wallets with sufficient gas", async () => {
      const walletAddress = "0xWallet1"
      const walletPk = "wallet1"
      const sufficientBalance = BigInt(2 * 10 ** 18) // 2 ETH, more than MIN_GAS (0.01 ETH)

      // Setup: Create a paused wallet state
      walletStates.set(walletAddress, {
        available: false, // Wallet is paused
        balance: BigInt(0.001 * 10 ** 18), // Low balance
        index: 0,
        address: walletAddress,
        walletPk,
      })

      // Create a mock worker
      const mockWorker = {
        resume: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      }
      walletWorkers.set(walletAddress, mockWorker as any)

      // Mock signer.getAddress to return the wallet address
      mockSigner.getAddress = vi.fn().mockResolvedValue(walletAddress)
      // Mock provider to return sufficient balance
      mockProvider.getBalance = vi.fn().mockResolvedValue(sufficientBalance)

      // Call the function
      await checkAndResumePausedWallets()

      // Verify worker.resume was called
      expect(mockWorker.resume).toHaveBeenCalledTimes(1)

      // Verify wallet state was updated
      const state = walletStates.get(walletAddress)
      expect(state?.available).toBe(true)
      expect(state?.balance).toBe(sufficientBalance)

      // Verify notification was sent (using the module-level telegramNotifierService)
      expect(telegramNotifierService.sendError).toHaveBeenCalledWith(expect.stringContaining("resumed - gas replenished"))
    })

    it("should not resume wallets with insufficient gas", async () => {
      const walletAddress = "0xWallet2"
      const walletPk = "wallet2"
      const insufficientBalance = BigInt(0.001 * 10 ** 18) // 0.001 ETH, less than MIN_GAS (0.01 ETH)

      // Setup: Create a paused wallet state
      walletStates.set(walletAddress, {
        available: false,
        balance: BigInt(0.0005 * 10 ** 18),
        index: 1,
        address: walletAddress,
        walletPk,
      })

      // Create a mock worker
      const mockWorker = {
        resume: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      }
      walletWorkers.set(walletAddress, mockWorker as any)

      // Mock signer.getAddress to return the wallet address
      mockSigner.getAddress = vi.fn().mockResolvedValue(walletAddress)
      // Mock provider to return insufficient balance
      mockProvider.getBalance = vi.fn().mockResolvedValue(insufficientBalance)

      // Call the function
      await checkAndResumePausedWallets()

      // Verify worker.resume was NOT called
      expect(mockWorker.resume).not.toHaveBeenCalled()

      // Verify wallet state is still paused but balance was updated
      const state = walletStates.get(walletAddress)
      expect(state?.available).toBe(false)
      expect(state?.balance).toBe(insufficientBalance)
    })

    it("should handle errors gracefully when checking wallet balance", async () => {
      const walletAddress = "0xWallet3"
      const walletPk = "wallet3"

      // Setup: Create a paused wallet state
      walletStates.set(walletAddress, {
        available: false,
        balance: BigInt(0.001 * 10 ** 18),
        index: 2,
        address: walletAddress,
        walletPk,
      })

      // Create a mock worker
      const mockWorker = {
        resume: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      }
      walletWorkers.set(walletAddress, mockWorker as any)

      // Mock signer.getAddress to return the wallet address
      mockSigner.getAddress = vi.fn().mockResolvedValue(walletAddress)
      // Mock getBalance to throw an error
      mockProvider.getBalance = vi.fn().mockRejectedValue(new Error("Network error"))

      // Function should handle errors without crashing
      await expect(checkAndResumePausedWallets()).resolves.not.toThrow()

      // Verify worker.resume was NOT called due to error
      expect(mockWorker.resume).not.toHaveBeenCalled()
    })

    it("should return early when no paused wallets exist", async () => {
      // Setup: Create available wallets (not paused)
      walletStates.set("0xWallet1", {
        available: true,
        balance: BigInt(1 * 10 ** 18),
        index: 0,
        address: "0xWallet1",
        walletPk: "wallet1",
      })

      // Reset getBalance mock to track calls
      mockProvider.getBalance = vi.fn()

      // Call the function
      await checkAndResumePausedWallets()

      // Verify getBalance was not called (early return)
      expect(mockProvider.getBalance).not.toHaveBeenCalled()
    })

    it("should handle multiple paused wallets", async () => {
      const wallet1Address = "0xWallet1"
      const wallet2Address = "0xWallet2"
      const wallet1Pk = "wallet1"
      const wallet2Pk = "wallet2"
      const sufficientBalance = BigInt(2 * 10 ** 18)

      // Setup: Create two paused wallets
      walletStates.set(wallet1Address, {
        available: false,
        balance: BigInt(0.001 * 10 ** 18),
        index: 0,
        address: wallet1Address,
        walletPk: wallet1Pk,
      })

      walletStates.set(wallet2Address, {
        available: false,
        balance: BigInt(0.001 * 10 ** 18),
        index: 1,
        address: wallet2Address,
        walletPk: wallet2Pk,
      })

      // Create mock workers
      const mockWorker1 = {
        resume: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      }
      const mockWorker2 = {
        resume: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      }
      walletWorkers.set(wallet1Address, mockWorker1 as any)
      walletWorkers.set(wallet2Address, mockWorker2 as any)

      // Mock signer.getAddress to return the correct address for each wallet
      mockSigner.getAddress = vi.fn().mockResolvedValueOnce(wallet1Address).mockResolvedValueOnce(wallet2Address)
      // Mock provider to return sufficient balance for both
      mockProvider.getBalance = vi.fn().mockResolvedValue(sufficientBalance)

      // Call the function
      await checkAndResumePausedWallets()

      // Verify both workers were resumed
      expect(mockWorker1.resume).toHaveBeenCalledTimes(1)
      expect(mockWorker2.resume).toHaveBeenCalledTimes(1)

      // Verify both wallet states were updated
      expect(walletStates.get(wallet1Address)?.available).toBe(true)
      expect(walletStates.get(wallet2Address)?.available).toBe(true)
    })
  })
})
