import { describe, it, expect, vi, beforeEach } from "vitest"
import { AddressLike, JsonRpcProvider } from "ethers"

import { PrismaClient } from "@prisma/client"
import { LiquidationBotLogRepository } from "../../db/LiquidationBotLogRepository.js"
import { PositionSnapshotRepository } from "../../db/PositionSnapshotRepository.js"
import { MarketConfigRepository } from "../../db/MarketConfigRepository.js"
import { MarketContractsRepository } from "../../db/MarketContractsRepository.js"
import { LiquidationBotLogService } from "../../services/LiquidationBotLogService.js"
import { LiquidationExecutionContext } from "../../services/LiquidationExecutionContext.js"

import { LiquidationUserFullInfo } from "../../type/data.js"
import { LiquidationCheckRunner } from "../../services/LiquidationCheckRunner.js"
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
vi.mock("services/LiquidationBotLogService")
vi.mock("config/indexer_setup", () => ({
  setUpIndexer: vi.fn(() => ({
    providers: [{} as JsonRpcProvider],
    handleError: vi.fn(),
  })),
}))
vi.mock("config/liquidation_config", () => ({
  liquidationConfig: {
    snapshotTolerance: 0.001,
    queueRedis: "redis://localhost:6379",
    queue: {
      attempts: 10,
      backoff: {
        type: "fixed",
        delay: 12_000,
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

describe("LiquidationCheckRunner", () => {
  let mockLiquidationBotLogRepository: LiquidationBotLogRepository
  let mockLiquidationBotLogService: LiquidationBotLogService
  let mockLiquidationCheckService: any
  let mockContext: LiquidationExecutionContext
  let mockProviders: JsonRpcProvider[]
  let liquidationCheckRunner: LiquidationCheckRunner
  let mockTelegramNotifierService: TelegramNotifierService
  let mockPositionSnapshotRepository: PositionSnapshotRepository
  let mockMarketConfigRepository: MarketConfigRepository
  let mockMarketContractsRepository: MarketContractsRepository

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
    mockLiquidationBotLogRepository = new LiquidationBotLogRepository({} as PrismaClient)
    mockTelegramNotifierService = new TelegramNotifierService({
      botToken: "process.env.TELEGRAM_BOT_TOKEN!",
      chatId: "process.env.TELEGRAM_CHAT_ID!",
    })
    // Setup mock services
    mockLiquidationBotLogService = new LiquidationBotLogService(mockLiquidationBotLogRepository, mockTelegramNotifierService)

    mockLiquidationCheckService = {
      checkContext: vi.fn(),
      getLiquidationParams: vi.fn(),
      getOnchainData: vi.fn(),
      analyzeLiquidation: vi.fn(),
      prioritizeActions: vi.fn(),
      executeSeizing: vi.fn(),
      executeLiquidation: vi.fn(),
      saveFiles: vi.fn(),
    }
    mockProviders = [{} as JsonRpcProvider]

    // Mock service methods
    vi.spyOn(mockLiquidationCheckService, "checkContext").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationCheckService, "getLiquidationParams").mockResolvedValue({
      markets: ["0xMarket1"],
      borrowers: [{ account: "0xUser1", market: "0xMarket1" }],
    })
    vi.spyOn(mockLiquidationCheckService, "getOnchainData").mockResolvedValue({
      markets: [],
      accounts: [],
      blockNumber: 0n,
      blockTimestamp: 0n,
    })
    vi.spyOn(mockLiquidationCheckService, "analyzeLiquidation").mockResolvedValue({
      seizingList: [],
      liquidationList: [],
    })
    vi.spyOn(mockLiquidationCheckService, "prioritizeActions").mockReturnValue([])
    vi.spyOn(mockLiquidationCheckService, "executeSeizing").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationCheckService, "executeLiquidation").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationCheckService, "saveFiles").mockResolvedValue(undefined)

    // Mock bot service methods
    vi.spyOn(mockLiquidationBotLogService, "logLiquidationParams").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationBotLogService, "logOnchainData").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationBotLogService, "logLiquidationAnalysis").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationBotLogService, "logError").mockResolvedValue(undefined)
    vi.spyOn(mockTelegramNotifierService, "sendMessage").mockResolvedValue(true)
    vi.spyOn(mockTelegramNotifierService, "sendError").mockResolvedValue(true)

    // Create service instance
    mockPositionSnapshotRepository = new PositionSnapshotRepository({} as PrismaClient)
    mockMarketConfigRepository = new MarketConfigRepository({} as PrismaClient)
    mockMarketContractsRepository = new MarketContractsRepository({} as PrismaClient)
    vi.spyOn(mockPositionSnapshotRepository, "saveSnapshots").mockResolvedValue(undefined)
    vi.spyOn(mockPositionSnapshotRepository, "getLatestSnapshotsWithin24h").mockResolvedValue([])
    vi.spyOn(mockMarketConfigRepository, "saveMarketConfigs").mockResolvedValue(undefined)
    vi.spyOn(mockMarketConfigRepository, "getLastUpdateByMarketIds").mockResolvedValue(new Map())
    vi.spyOn(mockMarketContractsRepository, "getContracts").mockResolvedValue([])
    liquidationCheckRunner = new LiquidationCheckRunner(
      mockLiquidationCheckService as any,
      mockLiquidationCheckService as any,
      mockContext,
      mockLiquidationBotLogService,
      mockTelegramNotifierService,
      mockProviders,
      mockPositionSnapshotRepository,
      mockMarketConfigRepository,
      mockMarketContractsRepository
    )
  })

  it("should execute the full liquidation process successfully", async () => {
    // Mock analyzeLiquidation to return non-empty lists so prioritizeActions gets called
    vi.spyOn(mockLiquidationCheckService, "analyzeLiquidation").mockResolvedValue({
      seizingList: [{ account: "0xUser1" as AddressLike, market: "0xMarket1" as AddressLike } as LiquidationUserFullInfo],
      liquidationList: [],
    })

    await liquidationCheckRunner.run()

    // Verify the sequence of operations
    expect(mockLiquidationCheckService.checkContext).toHaveBeenCalled()
    expect(mockLiquidationCheckService.getLiquidationParams).toHaveBeenCalled()
    expect(mockLiquidationCheckService.getOnchainData).toHaveBeenCalled()
    const getOnchainDataCall = vi.mocked(mockLiquidationCheckService.getOnchainData).mock.calls[0]
    expect(getOnchainDataCall[0]).toEqual(mockProviders)
    expect(getOnchainDataCall[1]).toEqual(["0xMarket1"])
    expect(getOnchainDataCall[2]).toEqual([{ account: "0xUser1", market: "0xMarket1" }])
    expect(getOnchainDataCall[3]).toBeUndefined()
    expect(mockLiquidationCheckService.analyzeLiquidation).toHaveBeenCalled()
    expect(mockLiquidationCheckService.prioritizeActions).toHaveBeenCalled()
  })

  it("should handle errors and send notifications", async () => {
    const error = new Error("Test error")
    vi.spyOn(mockLiquidationCheckService, "checkContext").mockRejectedValue(error)

    await expect(liquidationCheckRunner.run()).rejects.toThrow("Test error")
    expect(mockLiquidationBotLogService.logError).toHaveBeenCalledWith("check_context", error, mockContext, undefined, false)
    expect(mockTelegramNotifierService.sendError).toHaveBeenCalledWith("Liquidation Error on check_context: Test error")
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
    vi.spyOn(mockLiquidationCheckService, "analyzeLiquidation").mockResolvedValue({
      seizingList: [{ account: "0xUser1" as AddressLike, market: "0xMarket1" as AddressLike } as LiquidationUserFullInfo],
      liquidationList: [],
    })
    vi.spyOn(mockLiquidationCheckService, "prioritizeActions").mockReturnValue([{ ...seizing }])

    await liquidationCheckRunner.run()

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
    expect(mockLiquidationCheckService.executeSeizing).not.toHaveBeenCalled()
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
    vi.spyOn(mockLiquidationCheckService, "analyzeLiquidation").mockResolvedValue({
      seizingList: [],
      liquidationList: [{ account: "0xUser1" as AddressLike, market: "0xMarket1" as AddressLike } as LiquidationUserFullInfo],
    })
    vi.spyOn(mockLiquidationCheckService, "prioritizeActions").mockReturnValue([{ ...liquidation }])

    await liquidationCheckRunner.run()

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
    expect(mockLiquidationCheckService.executeLiquidation).not.toHaveBeenCalled()
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
    vi.spyOn(mockLiquidationCheckService, "analyzeLiquidation").mockResolvedValue({
      seizingList: actions.filter((a) => a.type === "seizing").map((a) => ({ account: a.account, market: a.market }) as LiquidationUserFullInfo),
      liquidationList: actions.filter((a) => a.type === "liquidation").map((a) => ({ account: a.account, market: a.market }) as LiquidationUserFullInfo),
    })
    vi.spyOn(mockLiquidationCheckService, "prioritizeActions").mockReturnValue(actions)

    await liquidationCheckRunner.run()

    expect(mocks.add).toHaveBeenCalledTimes(6)
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

  describe("saveSnapshotsAndConfig", () => {
    const MARKET_ADDRESS = "0xMarket1"
    const MARKET_ID = 1n

    const onChainData = {
      markets: [
        {
          market: MARKET_ADDRESS,
          maxLTV: 75_000n,
          liquidationThreshold: 80_000n,
          collateralUSDPrice: 1000n * DECIMALS,
          oracleDecimals: 18n,
          collatToken: "0xCollat1",
          maxMarketDebt: 500_000n * DECIMALS,
        },
      ],
      accounts: [
        {
          market: MARKET_ADDRESS,
          healthRatio: 2n * 10n ** 18n,
          userDebt: 400n * DECIMALS,
          positionValue: 1000n * DECIMALS,
          collateralBalance: 1n * DECIMALS,
        },
      ],
    }

    const borrowers = [{ account: "0xUser1", market: MARKET_ADDRESS }]

    function setupOnChainMocks() {
      vi.mocked(mockMarketContractsRepository.getContracts).mockResolvedValue([{ id: MARKET_ID, contract_address: MARKET_ADDRESS } as any])
      vi.mocked(mockLiquidationCheckService.getOnchainData).mockResolvedValue(onChainData as any)
      vi.mocked(mockLiquidationCheckService.getLiquidationParams).mockResolvedValue({
        markets: [MARKET_ADDRESS],
        borrowers,
      })
    }

    it("should compute and save position snapshots correctly", async () => {
      setupOnChainMocks()

      await liquidationCheckRunner.run()

      expect(mockPositionSnapshotRepository.saveSnapshots).toHaveBeenCalledWith([
        expect.objectContaining({
          market_id: MARKET_ID,
          borrower_address: "0xuser1",
          collateral_balance: 1,
          position_value_usd: 1000,
          user_debt: 400,
          ltv: 0.4,
          cr: 2.5,
          margin: 0.4,
          health_ratio: 2,
          liquidation_price: 500,
          distance_pct: 50,
        }),
      ])
    })

    it("should save market config when no previous update exists", async () => {
      setupOnChainMocks()
      vi.mocked(mockMarketConfigRepository.getLastUpdateByMarketIds).mockResolvedValue(new Map())

      await liquidationCheckRunner.run()

      expect(mockMarketConfigRepository.saveMarketConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          market_id: MARKET_ID,
          max_ltv: 0.75,
          liquidation_threshold: 0.8,
          max_debt: 500_000,
        }),
      ])
    })

    it("should skip market config save when last update is recent", async () => {
      setupOnChainMocks()
      vi.mocked(mockMarketConfigRepository.getLastUpdateByMarketIds).mockResolvedValue(new Map([[MARKET_ID, new Date()]]))

      await liquidationCheckRunner.run()

      expect(mockPositionSnapshotRepository.saveSnapshots).toHaveBeenCalled()
      expect(mockMarketConfigRepository.saveMarketConfigs).not.toHaveBeenCalled()
    })

    it("should not block liquidation flow on snapshot save failure", async () => {
      vi.mocked(mockMarketContractsRepository.getContracts).mockRejectedValue(new Error("DB error"))
      vi.mocked(mockLiquidationCheckService.getOnchainData).mockResolvedValue(onChainData as any)
      vi.mocked(mockLiquidationCheckService.getLiquidationParams).mockResolvedValue({
        markets: [MARKET_ADDRESS],
        borrowers,
      })

      await liquidationCheckRunner.run()

      expect(mockLiquidationCheckService.analyzeLiquidation).toHaveBeenCalled()
    })

    it("should deduplicate snapshots when values change less than tolerance", async () => {
      setupOnChainMocks()
      vi.mocked(mockPositionSnapshotRepository.getLatestSnapshotsWithin24h).mockResolvedValue([
        {
          market_id: MARKET_ID,
          borrower_address: "0xuser1",
          user_debt: 400,
          position_value_usd: 1000,
        } as any,
      ])

      await liquidationCheckRunner.run()

      // Same values → filtered out by dedup
      expect(mockPositionSnapshotRepository.saveSnapshots).toHaveBeenCalledWith([])
    })

    it("should persist snapshot when user_debt changes beyond tolerance", async () => {
      setupOnChainMocks()
      vi.mocked(mockPositionSnapshotRepository.getLatestSnapshotsWithin24h).mockResolvedValue([
        {
          market_id: MARKET_ID,
          borrower_address: "0xuser1",
          user_debt: 399, // diff = 1, well above tolerance of 0.001
          position_value_usd: 1000,
        } as any,
      ])

      await liquidationCheckRunner.run()

      expect(mockPositionSnapshotRepository.saveSnapshots).toHaveBeenCalledWith([expect.objectContaining({ user_debt: 400 })])
    })

    it("should persist snapshot when position_value_usd changes beyond tolerance", async () => {
      setupOnChainMocks()
      vi.mocked(mockPositionSnapshotRepository.getLatestSnapshotsWithin24h).mockResolvedValue([
        {
          market_id: MARKET_ID,
          borrower_address: "0xuser1",
          user_debt: 400,
          position_value_usd: 998, // diff = 2, above tolerance
        } as any,
      ])

      await liquidationCheckRunner.run()

      expect(mockPositionSnapshotRepository.saveSnapshots).toHaveBeenCalledWith([expect.objectContaining({ position_value_usd: 1000 })])
    })

    it("should persist snapshot when no previous snapshot exists (first time)", async () => {
      setupOnChainMocks()
      vi.mocked(mockPositionSnapshotRepository.getLatestSnapshotsWithin24h).mockResolvedValue([])

      await liquidationCheckRunner.run()

      expect(mockPositionSnapshotRepository.saveSnapshots).toHaveBeenCalledWith([expect.objectContaining({ borrower_address: "0xuser1" })])
    })

    it("should handle zero debt positions gracefully", async () => {
      vi.mocked(mockMarketContractsRepository.getContracts).mockResolvedValue([{ id: MARKET_ID, contract_address: MARKET_ADDRESS } as any])
      vi.mocked(mockLiquidationCheckService.getOnchainData).mockResolvedValue({
        markets: onChainData.markets,
        accounts: [
          {
            market: MARKET_ADDRESS,
            healthRatio: 0n,
            userDebt: 0n,
            positionValue: 1000n * DECIMALS,
            collateralBalance: 1n * DECIMALS,
          },
        ],
      } as any)
      vi.mocked(mockLiquidationCheckService.getLiquidationParams).mockResolvedValue({
        markets: [MARKET_ADDRESS],
        borrowers,
      })

      await liquidationCheckRunner.run()

      expect(mockPositionSnapshotRepository.saveSnapshots).toHaveBeenCalledWith([
        expect.objectContaining({
          ltv: 0,
          cr: 0,
          health_ratio: 0,
          liquidation_price: 0,
          distance_pct: 0,
        }),
      ])
    })
  })
})
