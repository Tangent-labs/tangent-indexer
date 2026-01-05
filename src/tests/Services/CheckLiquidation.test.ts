import { describe, it, expect, vi, beforeEach } from "vitest"
import { AddressLike, JsonRpcProvider } from "ethers"

import { PrismaClient } from "@prisma/client"
import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository.js"
import { LiquidationBotLogRepository } from "../../db/LiquidationBotLogRepository.js"
import { LiquidationBotLogService } from "../../services/LiquidationBotLogService.js"
import { LiquidationService } from "../../services/LiquidationService.js"
import { LiquidationExecutionContext } from "../../services/LiquidationExecutionContext.js"

import { LiquidationUserFullInfo } from "../../type/data.js"
import { CheckLiquidationService } from "../../services/LiquidationCheckService.js"
import { TelegramNotifierService } from "../../services/TelegramNotificationServices.js"

const DECIMALS = BigInt(10 ** 18)

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
vi.mock("services/LiquidationService")
vi.mock("services/LiquidationBotLogService")
vi.mock("config/indexer_setup", () => ({
  setUpIndexer: vi.fn(() => ({
    providers: [{} as JsonRpcProvider],
    handleError: vi.fn(),
  })),
}))
vi.mock("config/indexer_config", () => ({
  indexerConfig: {
    liquidationQueueRedis: "redis://localhost:6379",
    liquidationQueue: {
      attempts: 10,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    },
  },
}))

// Mock BullMQ
const mocks = vi.hoisted(() => ({
  add: vi.fn().mockResolvedValue({}),
  close: vi.fn().mockResolvedValue(undefined),
  getJob: vi.fn().mockResolvedValue(null), // Return null to indicate job doesn't exist
}))

vi.mock("bullmq", () => {
  class MockQueue {
    add = mocks.add
    close = mocks.close
    getJob = mocks.getJob
  }
  return {
    Queue: MockQueue,
  }
})

describe("CheckLiquidationService", () => {
  let activeBorrowersRepository: ActiveBorrowersRepository
  let mockLiquidationBotLogRepository: LiquidationBotLogRepository
  let mockLiquidationBotLogService: LiquidationBotLogService
  let mockLiquidationService: LiquidationService
  let mockContext: LiquidationExecutionContext
  let mockProviders: JsonRpcProvider[]
  let checkLiquidationService: CheckLiquidationService
  let mockTelegramNotifierService: TelegramNotifierService

  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks()
    mocks.add.mockReset()
    mocks.close.mockReset()
    mocks.getJob.mockReset()
    mocks.getJob.mockResolvedValue(null) // Default: job doesn't exist

    // Setup mock context
    mockContext = new LiquidationExecutionContext()
    mockContext.isDbAlive = true

    // Setup mock repositories
    activeBorrowersRepository = new ActiveBorrowersRepository({} as PrismaClient)
    mockLiquidationBotLogRepository = new LiquidationBotLogRepository({} as PrismaClient)
    mockTelegramNotifierService = new TelegramNotifierService({
      botToken: "process.env.TELEGRAM_BOT_TOKEN!",
      chatId: "process.env.TELEGRAM_CHAT_ID!",
    })
    // Setup mock services
    mockLiquidationBotLogService = new LiquidationBotLogService(mockLiquidationBotLogRepository, mockTelegramNotifierService)
    mockLiquidationService = new LiquidationService(activeBorrowersRepository, mockContext, mockLiquidationBotLogService)
    mockProviders = [{} as JsonRpcProvider]

    // Mock service methods
    vi.spyOn(mockLiquidationService, "checkContext").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationService, "getLiquidationParams").mockResolvedValue({
      markets: ["0xMarket1"],
      borrowers: [{ account: "0xUser1", market: "0xMarket1" }],
    })
    vi.spyOn(mockLiquidationService, "getOnchainData").mockResolvedValue({
      markets: [],
      accounts: [],
    })
    vi.spyOn(mockLiquidationService, "analyzeLiquidation").mockResolvedValue({
      seizingList: [],
      liquidationList: [],
    })
    vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue([])
    vi.spyOn(mockLiquidationService, "executeSeizing").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationService, "executeLiquidation").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationService, "saveFiles").mockResolvedValue(undefined)

    // Mock bot service methods
    vi.spyOn(mockLiquidationBotLogService, "logLiquidationParams").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationBotLogService, "logOnchainData").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationBotLogService, "logLiquidationAnalysis").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationBotLogService, "logError").mockResolvedValue(undefined)
    vi.spyOn(mockTelegramNotifierService, "sendMessage").mockResolvedValue(true)

    // Create service instance
    checkLiquidationService = new CheckLiquidationService(
      mockLiquidationService,
      mockContext,
      mockLiquidationBotLogService,
      mockTelegramNotifierService,
      mockProviders
    )
  })

  it("should execute the full liquidation process successfully", async () => {
    // Mock analyzeLiquidation to return non-empty lists so prioritizeActions gets called
    vi.spyOn(mockLiquidationService, "analyzeLiquidation").mockResolvedValue({
      seizingList: [{ account: "0xUser1" as AddressLike, market: "0xMarket1" as AddressLike } as LiquidationUserFullInfo],
      liquidationList: [],
    })

    await checkLiquidationService.run()

    // Verify the sequence of operations
    expect(mockLiquidationService.checkContext).toHaveBeenCalled()
    expect(mockLiquidationService.getLiquidationParams).toHaveBeenCalled()
    expect(mockLiquidationService.getOnchainData).toHaveBeenCalled()
    const getOnchainDataCall = vi.mocked(mockLiquidationService.getOnchainData).mock.calls[0]
    expect(getOnchainDataCall[0]).toEqual(mockProviders)
    expect(getOnchainDataCall[1]).toEqual(["0xMarket1"])
    expect(getOnchainDataCall[2]).toEqual([{ account: "0xUser1", market: "0xMarket1" }])
    expect(getOnchainDataCall[3]).toBeUndefined()
    expect(mockLiquidationService.analyzeLiquidation).toHaveBeenCalled()
    expect(mockLiquidationService.prioritizeActions).toHaveBeenCalled()
  })

  it("should handle errors and send notifications", async () => {
    const error = new Error("Test error")
    vi.spyOn(mockLiquidationService, "checkContext").mockRejectedValue(error)

    await expect(checkLiquidationService.run()).rejects.toThrow("Test error")
    expect(mockLiquidationBotLogService.logError).toHaveBeenCalledWith("check_context", error, mockContext, undefined, true)
    expect(mockTelegramNotifierService.sendMessage).toHaveBeenCalledWith("Liquidation Error on check_context: Test error")
  })

  it("should add seizing actions to the queue", async () => {
    const seizing: LiquidationUserFullInfo & { type: "seizing" } = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 500000000000000000n,
      userDebt: 600n * DECIMALS,
      positionValue: 550n * DECIMALS,
      collateralBalance: 1500n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
      type: "seizing",
    }

    // Mock analyzeLiquidation to return non-empty lists so the code doesn't return early
    vi.spyOn(mockLiquidationService, "analyzeLiquidation").mockResolvedValue({
      seizingList: [{ account: "0xUser1" as AddressLike, market: "0xMarket1" as AddressLike } as LiquidationUserFullInfo],
      liquidationList: [],
    })
    vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue([{ ...seizing }])

    await checkLiquidationService.run()

    // The action is passed through prepareSerialize (which is mocked to return data as-is in tests)
    // BullMQ add signature: add(name, data, options)
    expect(mocks.add).toHaveBeenCalledWith(
      "liquidation", // job name (first parameter)
      expect.objectContaining({
        account: "0xUser1",
        market: "0xMarket1",
        healthRatio: 500000000000000000n,
        userDebt: 600n * DECIMALS,
        positionValue: 550n * DECIMALS,
        collateralBalance: 1500n * DECIMALS,
        collatToken: "0xToken1",
        type: "seizing",
      }),
      expect.objectContaining({
        jobId: "0xMarket1-0xUser1-seizing", // jobId in options per BullMQ docs
        priority: 3, // seizing has priority 3
        attempts: expect.any(Number),
        backoff: expect.any(Object),
        removeOnComplete: true,
        removeOnFail: false,
      })
    )
    expect(mockLiquidationService.executeSeizing).not.toHaveBeenCalled()
  })

  it("should add liquidation actions to the queue", async () => {
    const liquidation: LiquidationUserFullInfo & { type: "liquidation" } = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2000000000000000000n,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 1500n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
      type: "liquidation",
    }

    // Mock analyzeLiquidation to return non-empty lists so the code doesn't return early
    vi.spyOn(mockLiquidationService, "analyzeLiquidation").mockResolvedValue({
      seizingList: [],
      liquidationList: [{ account: "0xUser1" as AddressLike, market: "0xMarket1" as AddressLike } as LiquidationUserFullInfo],
    })
    vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue([{ ...liquidation }])

    await checkLiquidationService.run()

    // The action is passed through prepareSerialize (which is mocked to return data as-is in tests)
    // BullMQ add signature: add(name, data, options) with jobId in options
    expect(mocks.add).toHaveBeenCalledWith(
      "liquidation", // job name (first parameter)
      expect.objectContaining({
        account: "0xUser1",
        market: "0xMarket1",
        healthRatio: 2000000000000000000n,
        userDebt: 760n * DECIMALS,
        positionValue: 1000n * DECIMALS,
        collateralBalance: 1500n * DECIMALS,
        collatToken: "0xToken1",
        type: "liquidation",
      }),
      expect.objectContaining({
        jobId: "0xMarket1-0xUser1-liquidation", // jobId in options per BullMQ docs
        priority: 2, // liquidation has priority 2 (processed before seizing)
        attempts: expect.any(Number),
        backoff: expect.any(Object),
        removeOnComplete: true,
        removeOnFail: false,
      })
    )
    expect(mockLiquidationService.executeLiquidation).not.toHaveBeenCalled()
  })

  it("should handle multiple actions and add them to the queue", async () => {
    const actions: Array<LiquidationUserFullInfo & { type: "seizing" | "liquidation" }> = []
    for (let i = 0; i < 5; i++) {
      actions.push({
        account: `0xUser${i}` as AddressLike,
        market: `0xMarket${i}` as AddressLike,
        healthRatio: 500000000000000000n,
        userDebt: 600n * DECIMALS,
        positionValue: (1000n - BigInt(i * 100)) * DECIMALS,
        collateralBalance: 1500n * DECIMALS,
        collatToken: "0xToken1" as AddressLike,
        type: i % 2 === 0 ? "seizing" : "liquidation",
      })
    }

    // Mock analyzeLiquidation to return non-empty lists so the code doesn't return early
    vi.spyOn(mockLiquidationService, "analyzeLiquidation").mockResolvedValue({
      seizingList: actions.filter((a) => a.type === "seizing").map((a) => ({ account: a.account, market: a.market }) as LiquidationUserFullInfo),
      liquidationList: actions.filter((a) => a.type === "liquidation").map((a) => ({ account: a.account, market: a.market }) as LiquidationUserFullInfo),
    })
    vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue(actions)

    await checkLiquidationService.run()

    expect(mocks.add).toHaveBeenCalledTimes(5)
    actions.forEach((action) => {
      const expectedPriority = action.type === "liquidation" ? 2 : 3
      const jobId = `${action.market}-${action.account}-${action.type}`
      // BullMQ add signature: add(name, data, options) with jobId in options
      expect(mocks.add).toHaveBeenCalledWith(
        "liquidation", // job name (first parameter)
        expect.objectContaining({
          account: action.account,
          market: action.market,
          type: action.type,
          // prepareSerialize is mocked to return data as-is in tests, so BigInt values remain BigInt
          healthRatio: action.healthRatio,
          userDebt: action.userDebt,
          positionValue: action.positionValue,
          collateralBalance: action.collateralBalance,
          collatToken: action.collatToken,
        }),
        expect.objectContaining({
          jobId, // jobId in options per BullMQ docs
          priority: expectedPriority,
          attempts: expect.any(Number),
          backoff: expect.any(Object),
          removeOnComplete: true,
          removeOnFail: false,
        })
      )
    })
  })
})
