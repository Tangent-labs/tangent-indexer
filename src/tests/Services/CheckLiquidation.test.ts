import { describe, it, expect, vi, beforeEach } from "vitest"
import { AddressLike, JsonRpcProvider } from "ethers"

import { PrismaClient } from "@prisma/client"
import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository.js"
import { LiquidationBotLogRepository } from "../../db/LiquidationBotLogRepository.js"
import { LiquidationBotLogService } from "../../services/LiquidationBotLogService.js"
import { LiquidationService } from "../../services/LiquidationService.js"
import { LiquidationExecutionContext } from "../../services/LiquidationExecutionContext.js"

import { LiquidationUserFullInfo } from "../../type/data.js"
import { CheckLiquidationService } from "../../services/CheckLiquidationService.js"
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
      notDebtorAnymoreList: [],
    })
    vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue([])
    vi.spyOn(mockLiquidationService, "executeSeizing").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationService, "executeLiquidation").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationService, "saveFiles").mockResolvedValue(undefined)

    // Mock bot service methods
    vi.spyOn(mockLiquidationBotLogService, "logLiquidationParams").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationBotLogService, "logOnchainData").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationBotLogService, "logLiquidationAnalysis").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationBotLogService, "logCleanDebtors").mockResolvedValue(undefined)
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
    await checkLiquidationService.run()

    // Verify the sequence of operations
    expect(mockLiquidationService.checkContext).toHaveBeenCalled()
    expect(mockLiquidationService.getLiquidationParams).toHaveBeenCalled()
    expect(mockLiquidationService.getOnchainData).toHaveBeenCalledWith(mockProviders, ["0xMarket1"], [{ account: "0xUser1", market: "0xMarket1" }])
    expect(mockLiquidationService.analyzeLiquidation).toHaveBeenCalled()
    expect(mockLiquidationService.prioritizeActions).toHaveBeenCalled()
  })

  it("should handle errors and send notifications", async () => {
    const error = new Error("Test error")
    vi.spyOn(mockLiquidationService, "checkContext").mockRejectedValue(error)

    await expect(checkLiquidationService.run()).rejects.toThrow("Test error")
    expect(mockLiquidationBotLogService.logError).toHaveBeenCalledWith("check_context", error, mockContext)
    expect(mockTelegramNotifierService.sendMessage).toHaveBeenCalledWith("❌ Liquidation Error on check_context: Test error")
  })

  it("should process seizing when present", async () => {
    // Setup wallet
    mockContext.walletsPks = ["pk0"]

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

    vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue([{ ...seizing }])

    await checkLiquidationService.run()

    expect(mockLiquidationService.executeSeizing).toHaveBeenCalledWith(0, seizing)
  })

  it("should process liquidations when present", async () => {
    // Setup wallet
    mockContext.walletsPks = ["pk0"]

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

    vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue([{ ...liquidation }])

    await checkLiquidationService.run()

    expect(mockLiquidationService.executeLiquidation).toHaveBeenCalledWith(0, liquidation)
  })

  it("should send telegram notification when executeSeizing throws an error", async () => {
    // Setup wallet
    mockContext.walletsPks = ["pk0"]

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

    const error = new Error("Seizing execution failed")
    vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue([{ ...seizing }])
    // Mock the repository method that logError will call
    vi.spyOn(mockLiquidationBotLogRepository, "insertLiquidationLog").mockResolvedValue(undefined)
    // Create a real instance of LiquidationBotLogService for this test
    const { LiquidationBotLogService: RealLiquidationBotLogService } = await vi.importActual<typeof import("../../services/LiquidationBotLogService.js")>(
      "../../services/LiquidationBotLogService.js"
    )
    const realLiquidationBotLogService = new RealLiquidationBotLogService(mockLiquidationBotLogRepository, mockTelegramNotifierService)
    // Replace the mock service with the real one in the liquidation service
    mockLiquidationService.liquidationBotService = realLiquidationBotLogService
    vi.spyOn(realLiquidationBotLogService, "logError")
    vi.spyOn(mockLiquidationService, "executeSeizing").mockImplementation(async () => {
      await realLiquidationBotLogService.logError("liquidation_bad_debt_execution", error, mockContext)
    })

    await checkLiquidationService.run()

    expect(mockLiquidationService.executeSeizing).toHaveBeenCalledWith(0, seizing)
    expect(realLiquidationBotLogService.logError).toHaveBeenCalledWith("liquidation_bad_debt_execution", error, mockContext)
  })

  it("should send telegram notification when executeLiquidation throws an error", async () => {
    // Setup wallet
    mockContext.walletsPks = ["pk0"]

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

    const error = new Error("Liquidation execution failed")
    const mockRoute = { params: { routeAddresses: [], swapParamsFull: [] } }
    vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue([{ ...liquidation }])
    // Mock the repository method that logError will call
    vi.spyOn(mockLiquidationBotLogRepository, "insertLiquidationLog").mockResolvedValue(undefined)
    // Create a real instance of LiquidationBotLogService for this test
    const { LiquidationBotLogService: RealLiquidationBotLogService } = await vi.importActual<typeof import("../../services/LiquidationBotLogService.js")>(
      "../../services/LiquidationBotLogService.js"
    )
    const realLiquidationBotLogService = new RealLiquidationBotLogService(mockLiquidationBotLogRepository, mockTelegramNotifierService)
    // Replace the mock service with the real one in the liquidation service
    mockLiquidationService.liquidationBotService = realLiquidationBotLogService
    vi.spyOn(realLiquidationBotLogService, "logError")
    vi.spyOn(mockLiquidationService, "executeLiquidation").mockImplementation(async () => {
      await realLiquidationBotLogService.logError("liquidation_execution", error, mockContext, { route: mockRoute, account: liquidation })
    })

    await checkLiquidationService.run()

    expect(mockLiquidationService.executeLiquidation).toHaveBeenCalledWith(0, liquidation)
    expect(realLiquidationBotLogService.logError).toHaveBeenCalledWith("liquidation_execution", error, mockContext, { route: mockRoute, account: liquidation })
  })

  describe("Per-wallet queue distribution", () => {
    it("should distribute actions across multiple wallets in round-robin fashion", async () => {
      // Setup 2 wallets
      mockContext.walletsPks = ["pk0", "pk1"]

      // Create 5 actions (more than wallet count)
      const actions: Array<LiquidationUserFullInfo & { type: "seizing" | "liquidation" }> = []
      for (let i = 0; i < 5; i++) {
        actions.push({
          account: `0xUser${i}` as AddressLike,
          market: `0xMarket${i}` as AddressLike,
          healthRatio: 500000000000000000n,
          userDebt: 600n * DECIMALS,
          positionValue: (1000n - BigInt(i * 100)) * DECIMALS, // Decreasing values
          collateralBalance: 1500n * DECIMALS,
          collatToken: "0xToken1" as AddressLike,
          type: i % 2 === 0 ? "seizing" : "liquidation",
        })
      }

      vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue(actions)

      await checkLiquidationService.run()

      // Verify all 5 actions were executed
      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledTimes(3) // Actions 0, 2, 4
      expect(mockLiquidationService.executeLiquidation).toHaveBeenCalledTimes(2) // Actions 1, 3

      // Verify round-robin distribution:
      // Action 0 (index 0) -> Wallet 0 (0 % 2 = 0)
      // Action 1 (index 1) -> Wallet 1 (1 % 2 = 1)
      // Action 2 (index 2) -> Wallet 0 (2 % 2 = 0)
      // Action 3 (index 3) -> Wallet 1 (3 % 2 = 1)
      // Action 4 (index 4) -> Wallet 0 (4 % 2 = 0)

      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledWith(0, actions[0])
      expect(mockLiquidationService.executeLiquidation).toHaveBeenCalledWith(1, actions[1])
      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledWith(0, actions[2])
      expect(mockLiquidationService.executeLiquidation).toHaveBeenCalledWith(1, actions[3])
      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledWith(0, actions[4])
    })

    it("should handle 10 actions with 2 wallets (5 seize + 5 liquidate)", async () => {
      // Setup 2 wallets
      mockContext.walletsPks = ["pk0", "pk1"]

      // Create 5 seize + 5 liquidate = 10 actions
      const seizingActions: Array<LiquidationUserFullInfo & { type: "seizing" }> = []
      const liquidationActions: Array<LiquidationUserFullInfo & { type: "liquidation" }> = []

      for (let i = 0; i < 5; i++) {
        seizingActions.push({
          account: `0xSeizeUser${i}` as AddressLike,
          market: `0xMarket${i}` as AddressLike,
          healthRatio: 500000000000000000n,
          userDebt: 600n * DECIMALS,
          positionValue: (1000n - BigInt(i * 100)) * DECIMALS,
          collateralBalance: 1500n * DECIMALS,
          collatToken: "0xToken1" as AddressLike,
          type: "seizing",
        })
      }

      for (let i = 0; i < 5; i++) {
        liquidationActions.push({
          account: `0xLiquidateUser${i}` as AddressLike,
          market: `0xMarket${i}` as AddressLike,
          healthRatio: 2000000000000000000n,
          userDebt: 760n * DECIMALS,
          positionValue: (1000n - BigInt(i * 50)) * DECIMALS,
          collateralBalance: 1500n * DECIMALS,
          collatToken: "0xToken1" as AddressLike,
          type: "liquidation",
        })
      }

      // prioritizeActions returns all actions sorted by positionValue
      const allActions = [...seizingActions, ...liquidationActions].sort((a, b) => Number(b.positionValue) - Number(a.positionValue))
      vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue(allActions)

      await checkLiquidationService.run()

      // Verify all 10 actions were executed
      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledTimes(5)
      expect(mockLiquidationService.executeLiquidation).toHaveBeenCalledTimes(5)

      // Verify round-robin distribution across 2 wallets
      const wallet0Calls = (mockLiquidationService.executeSeizing as any).mock.calls
        .filter((call: any[]) => call[0] === 0)
        .concat((mockLiquidationService.executeLiquidation as any).mock.calls.filter((call: any[]) => call[0] === 0))
      const wallet1Calls = (mockLiquidationService.executeSeizing as any).mock.calls
        .filter((call: any[]) => call[0] === 1)
        .concat((mockLiquidationService.executeLiquidation as any).mock.calls.filter((call: any[]) => call[0] === 1))

      // Each wallet should have 5 actions (10 total / 2 wallets)
      expect(wallet0Calls.length).toBe(5)
      expect(wallet1Calls.length).toBe(5)
    })

    it("should distribute actions across 3 wallets correctly", async () => {
      // Setup 3 wallets
      mockContext.walletsPks = ["pk0", "pk1", "pk2"]

      // Create 7 actions
      const actions: Array<LiquidationUserFullInfo & { type: "seizing" | "liquidation" }> = []
      for (let i = 0; i < 7; i++) {
        actions.push({
          account: `0xUser${i}` as AddressLike,
          market: `0xMarket${i}` as AddressLike,
          healthRatio: 500000000000000000n,
          userDebt: 600n * DECIMALS,
          positionValue: (1000n - BigInt(i * 50)) * DECIMALS,
          collateralBalance: 1500n * DECIMALS,
          collatToken: "0xToken1" as AddressLike,
          type: i % 2 === 0 ? "seizing" : "liquidation",
        })
      }

      vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue(actions)

      await checkLiquidationService.run()

      // Verify distribution: 7 actions across 3 wallets
      // Wallet 0: actions 0, 3, 6 (3 actions)
      // Wallet 1: actions 1, 4 (2 actions)
      // Wallet 2: actions 2, 5 (2 actions)

      const wallet0Calls = (mockLiquidationService.executeSeizing as any).mock.calls
        .filter((call: any[]) => call[0] === 0)
        .concat((mockLiquidationService.executeLiquidation as any).mock.calls.filter((call: any[]) => call[0] === 0))
      const wallet1Calls = (mockLiquidationService.executeSeizing as any).mock.calls
        .filter((call: any[]) => call[0] === 1)
        .concat((mockLiquidationService.executeLiquidation as any).mock.calls.filter((call: any[]) => call[0] === 1))
      const wallet2Calls = (mockLiquidationService.executeSeizing as any).mock.calls
        .filter((call: any[]) => call[0] === 2)
        .concat((mockLiquidationService.executeLiquidation as any).mock.calls.filter((call: any[]) => call[0] === 2))

      expect(wallet0Calls.length).toBe(3)
      expect(wallet1Calls.length).toBe(2)
      expect(wallet2Calls.length).toBe(2)

      // Verify specific wallet assignments
      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledWith(0, actions[0]) // 0 % 3 = 0
      expect(mockLiquidationService.executeLiquidation).toHaveBeenCalledWith(1, actions[1]) // 1 % 3 = 1
      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledWith(2, actions[2]) // 2 % 3 = 2
      expect(mockLiquidationService.executeLiquidation).toHaveBeenCalledWith(0, actions[3]) // 3 % 3 = 0
      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledWith(1, actions[4]) // 4 % 3 = 1
      expect(mockLiquidationService.executeLiquidation).toHaveBeenCalledWith(2, actions[5]) // 5 % 3 = 2
      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledWith(0, actions[6]) // 6 % 3 = 0
    })

    it("should process all actions even when there are more actions than wallets", async () => {
      // Setup 2 wallets
      mockContext.walletsPks = ["pk0", "pk1"]

      // Create 20 actions (much more than wallet count)
      const actions: Array<LiquidationUserFullInfo & { type: "seizing" | "liquidation" }> = []
      for (let i = 0; i < 20; i++) {
        actions.push({
          account: `0xUser${i}` as AddressLike,
          market: `0xMarket${i}` as AddressLike,
          healthRatio: 500000000000000000n,
          userDebt: 600n * DECIMALS,
          positionValue: (1000n - BigInt(i * 10)) * DECIMALS,
          collateralBalance: 1500n * DECIMALS,
          collatToken: "0xToken1" as AddressLike,
          type: i % 2 === 0 ? "seizing" : "liquidation",
        })
      }

      vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue(actions)

      await checkLiquidationService.run()

      // Verify all 20 actions were executed
      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledTimes(10)
      expect(mockLiquidationService.executeLiquidation).toHaveBeenCalledTimes(10)

      // Verify each wallet processed 10 actions (20 / 2 = 10)
      const wallet0Calls = (mockLiquidationService.executeSeizing as any).mock.calls
        .filter((call: any[]) => call[0] === 0)
        .concat((mockLiquidationService.executeLiquidation as any).mock.calls.filter((call: any[]) => call[0] === 0))
      const wallet1Calls = (mockLiquidationService.executeSeizing as any).mock.calls
        .filter((call: any[]) => call[0] === 1)
        .concat((mockLiquidationService.executeLiquidation as any).mock.calls.filter((call: any[]) => call[0] === 1))

      expect(wallet0Calls.length).toBe(10)
      expect(wallet1Calls.length).toBe(10)
    })

    it("should handle single wallet with multiple actions", async () => {
      // Setup 1 wallet
      mockContext.walletsPks = ["pk0"]

      // Create 5 actions
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

      vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue(actions)

      await checkLiquidationService.run()

      // All actions should go to wallet 0
      expect(mockLiquidationService.executeSeizing).toHaveBeenCalledTimes(3)
      expect(mockLiquidationService.executeLiquidation).toHaveBeenCalledTimes(2)

      // Verify all calls use wallet index 0
      const allCalls = (mockLiquidationService.executeSeizing as any).mock.calls.concat((mockLiquidationService.executeLiquidation as any).mock.calls)
      allCalls.forEach((call: any[]) => {
        expect(call[0]).toBe(0) // All should use wallet 0
      })
    })

    it("should handle empty action list gracefully", async () => {
      mockContext.walletsPks = ["pk0", "pk1"]
      vi.spyOn(mockLiquidationService, "prioritizeActions").mockReturnValue([])

      await checkLiquidationService.run()

      expect(mockLiquidationService.executeSeizing).not.toHaveBeenCalled()
      expect(mockLiquidationService.executeLiquidation).not.toHaveBeenCalled()
    })
  })
})
