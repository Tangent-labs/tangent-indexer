import { describe, it, expect, vi, beforeEach } from "vitest"
import { PrismaClient } from "@prisma/client"
import { MarketBorrowerRepository } from "db/MarketBorrowerRepository"
import { LiquidationBotLogRepository } from "db/LiquidationBotLogRepository"
import { LiquidationBotService } from "services/LiquidationBotLogService"
import { LiquidationService } from "services/LiquidationService"
import { LiquidationExecutionContext } from "services/LiquidationExecutionContext"
import { JsonRpcProvider } from "ethers"
import { LiquidationUserInInfo } from "type/data"
import NotificationService from "services/NotificationService"
import { CheckLiquidationService } from "services/CheckLiquidationService"

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

vi.mock("db/MarketBorrowerRepository")
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
  let mockMarketBorrowerRepository: MarketBorrowerRepository
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
    mockMarketBorrowerRepository = new MarketBorrowerRepository({} as PrismaClient)
    mockLiquidationBotLogRepository = new LiquidationBotLogRepository({} as PrismaClient)

    // Setup mock services
    mockLiquidationBotService = new LiquidationBotService(mockLiquidationBotLogRepository)
    mockLiquidationService = new LiquidationService(mockMarketBorrowerRepository, mockContext, mockLiquidationBotService)
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
      hardLiquidationList: [],
      softLiquidationList: [],
      notDebtorAnymoreList: [],
    })
    vi.spyOn(mockLiquidationService, "prioritizeActions").mockResolvedValue([])
    vi.spyOn(mockLiquidationService, "executeHardLiquidation").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationService, "executeSoftLiquidation").mockResolvedValue(undefined)
    vi.spyOn(mockLiquidationService, "processCleanDebtors").mockResolvedValue(undefined)
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

  it("should log liquidation parameters", async () => {
    await checkLiquidationService.run()

    expect(mockLiquidationBotService.logLiquidationParams).toHaveBeenCalledWith(
      {
        markets: ["0xMarket1"],
        borrowers: [{ account: "0xUser1", market: "0xMarket1" }],
      },
      mockContext
    )
  })

  it("should log on-chain data", async () => {
    await checkLiquidationService.run()

    expect(mockLiquidationBotService.logOnchainData).toHaveBeenCalledWith(
      {
        markets: [],
        accounts: [],
      },
      mockContext
    )
  })

  it("should log liquidation analysis", async () => {
    await checkLiquidationService.run()

    expect(mockLiquidationBotService.logLiquidationAnalysis).toHaveBeenCalledWith(
      {
        markets: [],
        accounts: [],
      },
      mockContext
    )
  })

  it("should log clean debtors when they exist", async () => {
    const notDebtorAnymoreList: LiquidationUserInInfo[] = [{ account: "0xUser1", market: "0xMarket1" }]
    vi.spyOn(mockLiquidationService, "analyzeLiquidation").mockResolvedValue({
      hardLiquidationList: [],
      softLiquidationList: [],
      notDebtorAnymoreList,
    })

    await checkLiquidationService.run()

    expect(mockLiquidationBotService.logCleanDebtors).toHaveBeenCalledWith(notDebtorAnymoreList, mockContext)
  })

  it("should log errors when they occur", async () => {
    const error = new Error("Test error")
    vi.spyOn(mockLiquidationService, "getLiquidationParams").mockRejectedValue(error)

    await expect(checkLiquidationService.run()).rejects.toThrow("Test error")
    expect(mockLiquidationBotService.logError).toHaveBeenCalledWith("liquidation_params", error, mockContext)
  })

  it("should not log clean debtors when none exist", async () => {
    await checkLiquidationService.run()

    expect(mockLiquidationBotService.logCleanDebtors).not.toHaveBeenCalled()
  })

  it("should send notification when an error occurs", async () => {
    const error = new Error("Test error")
    vi.spyOn(mockLiquidationService, "getLiquidationParams").mockRejectedValue(error)

    await expect(checkLiquidationService.run()).rejects.toThrow("Test error")
    expect(mockNotificationService.sendImmediateNotification).toHaveBeenCalledWith(error.message)
  })

  it("should send notification with specific error message when no RPCs are connected", async () => {
    const error = new Error("NO_RPC_CONNECTED")
    vi.spyOn(mockLiquidationService, "getLiquidationParams").mockRejectedValue(error)

    await expect(checkLiquidationService.run()).rejects.toThrow("NO_RPC_CONNECTED")
    expect(mockNotificationService.sendImmediateNotification).toHaveBeenCalledWith("NO_RPC_CONNECTED")
  })
})
