import { describe, it, expect, vi, beforeEach } from "vitest"
import { AddressLike, JsonRpcProvider } from "ethers"
import { PrismaClient } from "@prisma/client"
import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository.js"
import { LiquidationBotLogRepository } from "../../db/LiquidationBotLogRepository.js"
import { LiquidationBotService } from "../../services/LiquidationBotLogService.js"
import { LiquidationService } from "../../services/LiquidationService.js"
import { LiquidationExecutionContext } from "../../services/LiquidationExecutionContext.js"

import { LiquidationUserFullInfo } from "../../type/data.js"
import { NotificationService } from "../../services/NotificationService.js"
import { CheckLiquidationService } from "services/CheckLiquidationService.js"

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
  let mockLiquidationBotService: LiquidationBotService
  let mockLiquidationService: LiquidationService
  let mockContext: LiquidationExecutionContext
  let mockNotificationService: NotificationService
  let mockProviders: JsonRpcProvider[]
  let checkLiquidationService: CheckLiquidationService

  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks()

    // Setup mock context
    mockContext = new LiquidationExecutionContext()
    mockContext.isDbAlive = true

    // Setup mock repositories
    activeBorrowersRepository = new ActiveBorrowersRepository({} as PrismaClient)
    mockLiquidationBotLogRepository = new LiquidationBotLogRepository({} as PrismaClient)

    // Setup mock services
    mockLiquidationBotService = new LiquidationBotService(mockLiquidationBotLogRepository)
    mockLiquidationService = new LiquidationService(activeBorrowersRepository, mockContext, mockLiquidationBotService)
    mockNotificationService = new NotificationService()
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
    vi.spyOn(mockLiquidationBotService, "logLiquidationParams").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationBotService, "logOnchainData").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationBotService, "logLiquidationAnalysis").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationBotService, "logCleanDebtors").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationBotService, "logError").mockResolvedValue(undefined)
    vi.spyOn(mockNotificationService, "sendImmediateNotification").mockResolvedValue(undefined)

    // Create service instance
    checkLiquidationService = new CheckLiquidationService(
      mockLiquidationService,
      mockContext,
      mockLiquidationBotService,
      mockNotificationService,
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
    expect(mockLiquidationBotService.logError).toHaveBeenCalledWith("check_context", error, mockContext)
    expect(mockNotificationService.sendImmediateNotification).toHaveBeenCalledWith("Test error")
  })

  it("should process seizing when present", async () => {
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
})
