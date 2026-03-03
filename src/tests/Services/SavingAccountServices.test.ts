import { describe, it, expect, beforeEach, vi } from "vitest"
import { SavingAccountServices } from "../../services/events/SavingAccountServices.js"
import { SavingAccountRepository } from "../../db/SavingAccountRepository.js"
import { ProcessReportEvent } from "../../eventFectcher/savingAccountEventFetcher.js"

// Mock du repository
const mockSavingAccountRepository = {
  saveEvents: vi.fn(),
  findEventsAfterDate: vi.fn(),
} as unknown as SavingAccountRepository

describe("SavingAccountServices", () => {
  let savingAccountService: SavingAccountServices

  beforeEach(() => {
    vi.clearAllMocks()
    savingAccountService = new SavingAccountServices(mockSavingAccountRepository)
  })

  describe("formatSavingAccountEvents", () => {
    it("should process events correctly with available fields only", () => {
      // Arrange
      const mockEvents: ProcessReportEvent[] = [
        {
          block_id: 12345678,
          tx_hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          token: "0xBe53A109B494E5c9f97b9Cd39Fe969BE68BF6204",
          gain: BigInt("1000000000000000000"),
          loss: BigInt("500000000000000000"),
          currentDebtAfter: BigInt("5000000000000000000"),
          protocolFees: BigInt("10000000000000000"),
          totalFees: BigInt("20000000000000000"),
          totalRefunds: BigInt("0"),
        },
      ]

      const mockBlockTimestamps = new Map<number, number>([[12345678, Math.floor(Date.now() / 1000) - 3600]])

      // Act
      const result = savingAccountService.formatSavingAccountEvents(mockEvents, mockBlockTimestamps)

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        token: "0xBe53A109B494E5c9f97b9Cd39Fe969BE68BF6204",
        block_id: 12345678,
        tx_hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        gain: "1000000000000000000",
        currentDebtAfter: "5000000000000000000",
        block_date: expect.any(Date),
      })

      // Vérifier que les champs non disponibles ne sont pas inclus
      expect(result[0]).not.toHaveProperty("loss")
      expect(result[0]).not.toHaveProperty("protocolFees")
      expect(result[0]).not.toHaveProperty("totalFees")
      expect(result[0]).not.toHaveProperty("totalRefunds")
    })

    it("should handle multiple events", () => {
      // Arrange
      const mockEvents: ProcessReportEvent[] = [
        {
          block_id: 12345678,
          tx_hash: "0x1111111111111111111111111111111111111111111111111111111111111111",
          token: "0xToken1",
          gain: BigInt("1000"),
          loss: BigInt("500"),
          currentDebtAfter: BigInt("5000"),
          protocolFees: BigInt("10"),
          totalFees: BigInt("20"),
          totalRefunds: BigInt("0"),
        },
        {
          block_id: 12345679,
          tx_hash: "0x2222222222222222222222222222222222222222222222222222222222222222",
          token: "0xToken2",
          gain: BigInt("2000"),
          loss: BigInt("0"),
          currentDebtAfter: BigInt("7000"),
          protocolFees: BigInt("20"),
          totalFees: BigInt("30"),
          totalRefunds: BigInt("10"),
        },
      ]

      const date1 = Math.floor(Date.now() / 1000) - 3600 * 1000
      const date2 = Math.floor(Date.now() / 1000) - 1800 * 1000
      const date3 = Math.floor(Date.now() / 1000) - 1700 * 1000

      const mockBlockTimestamps = new Map<number, number>([
        [12345680, date3],
        [12345678, date1],
        [12345679, date2],
      ])

      // Act
      const result = savingAccountService.formatSavingAccountEvents(mockEvents, mockBlockTimestamps)

      // Assert
      expect(result).toHaveLength(2)
      expect(result[0].token).toBe("0xToken1")
      expect(result[0].block_date).toEqual(new Date(date1 * 1000))
      expect(result[1].token).toBe("0xToken2")
      expect(result[1].block_date).toEqual(new Date(date2 * 1000))
    })
  })

  describe("saveSavingAccountEvents", () => {
    it("should call repository saveEvents with processed data", async () => {
      // Arrange
      const mockEvents: ProcessReportEvent[] = [
        {
          block_id: 12345678,
          tx_hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          token: "0xBe53A109B494E5c9f97b9Cd39Fe969BE68BF6204",
          gain: BigInt("1000000000000000000"),
          loss: BigInt("500000000000000000"),
          currentDebtAfter: BigInt("5000000000000000000"),
          protocolFees: BigInt("10000000000000000"),
          totalFees: BigInt("20000000000000000"),
          totalRefunds: BigInt("0"),
        },
      ]

      const mockBlockTimestamps = new Map<number, number>([[12345678, Math.floor(Date.now() / 1000) - 3600]])

      // Act
      await savingAccountService.saveSavingAccountEvents(mockEvents, mockBlockTimestamps)

      // Assert
      expect(mockSavingAccountRepository.saveEvents).toHaveBeenCalledTimes(1)
      expect(mockSavingAccountRepository.saveEvents).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            token: "0xBe53A109B494E5c9f97b9Cd39Fe969BE68BF6204",
            block_id: 12345678,
            tx_hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            gain: "1000000000000000000",
            currentDebtAfter: "5000000000000000000",
            block_date: expect.any(Date),
          }),
        ])
      )
    })
  })

  describe("processApy", () => {
    it("should not insert when no events found", async () => {
      // Arrange
      const mockGlobalRepo = {
        getGlobalIndicatorIds: vi.fn().mockResolvedValue(
          new Map<string, bigint>([
            ["SAVING_APY_TAN", 1n],
            ["SAVING_APY_USG", 2n],
          ])
        ),
        insertGlobalIndicator: vi.fn(),
        insertGlobalIndicatorValue: vi.fn(),
      } as any

      ;(mockSavingAccountRepository.findEventsAfterDate as any).mockResolvedValue([])

      // Act
      const nowBC = new Date()
      await savingAccountService.processSavingAccountApy(mockGlobalRepo, nowBC, "0xTAN")

      // Assert
      expect(mockSavingAccountRepository.findEventsAfterDate).toHaveBeenCalledTimes(1)
      expect(mockGlobalRepo.insertGlobalIndicatorValue).not.toHaveBeenCalled()
    })

    it("should insert APY rows per token with correct values and indicator IDs", async () => {
      // Arrange
      const nowBC = new Date()
      const within7Days = new Date(nowBC.getTime() - 2 * 24 * 60 * 60 * 1000)

      const tanAddress = "0xTAN"
      const usgAddress = "0xUSG"

      const events = [
        // TAN token: 1e18 + 2e18 = 3e18 → 3 / 52
        { token: tanAddress, gain: "1000000000000000000", block_date: within7Days },
        { token: tanAddress, gain: "2000000000000000000", block_date: within7Days },
        // USG token: 5e17 → 0.5 / 52
        { token: usgAddress, gain: "500000000000000000", block_date: within7Days },
      ]

      ;(mockSavingAccountRepository.findEventsAfterDate as any).mockResolvedValue(events)

      const mockGlobalRepo = {
        getGlobalIndicatorIds: vi.fn().mockResolvedValue(
          new Map<string, bigint>([
            ["SAVING_APY_TAN", 11n],
            ["SAVING_APY_USG", 22n],
          ])
        ),
        insertGlobalIndicator: vi.fn(),
        insertGlobalIndicatorValue: vi.fn(),
      } as any

      // Act
      await savingAccountService.processSavingAccountApy(mockGlobalRepo, nowBC, tanAddress)

      // Assert
      expect(mockSavingAccountRepository.findEventsAfterDate).toHaveBeenCalledTimes(1)
      expect(mockGlobalRepo.insertGlobalIndicatorValue).toHaveBeenCalledTimes(1)

      const callArg = (mockGlobalRepo.insertGlobalIndicatorValue as any).mock.calls[0][0]
      expect(Array.isArray(callArg)).toBe(true)
      expect(callArg).toHaveLength(2)

      // Normalize for assertions
      const byIndicator = new Map<bigint, { value: number; timestamp: Date }>()
      for (const row of callArg) {
        byIndicator.set(row.global_indicator_id, { value: row.value, timestamp: row.timestamp })
        expect(row.timestamp instanceof Date).toBe(true)
        expect(row.timestamp).toEqual(nowBC)
      }

      // TAN: 3 / 52
      expect(byIndicator.get(11n)!.value).toBeCloseTo(3 / 52, 10)
      // USG: 0.5 / 52
      expect(byIndicator.get(22n)!.value).toBeCloseTo(0.5 / 52, 10)
    })

    it("should insert missing indicators when they don't exist", async () => {
      // Arrange
      const nowBC = new Date()
      const within7Days = new Date(nowBC.getTime() - 2 * 24 * 60 * 60 * 1000)

      const tanAddress = "0xTAN"
      const usgAddress = "0xUSG"

      const events = [
        { token: tanAddress, gain: "1000000000000000000", block_date: within7Days },
        { token: usgAddress, gain: "500000000000000000", block_date: within7Days },
      ]

      ;(mockSavingAccountRepository.findEventsAfterDate as any).mockResolvedValue(events)

      const mockGlobalRepo = {
        getGlobalIndicatorIds: vi.fn().mockResolvedValue(
          new Map<string, bigint>([
            ["SAVING_APY_TAN", 11n],
            // SAVING_APY_USG is missing
          ])
        ),
        insertGlobalIndicator: vi.fn().mockResolvedValue(new Map<string, bigint>([["SAVING_APY_USG", 22n]])),
        insertGlobalIndicatorValue: vi.fn(),
      } as any

      // Act
      await savingAccountService.processSavingAccountApy(mockGlobalRepo, nowBC, tanAddress)

      // Assert
      expect(mockGlobalRepo.getGlobalIndicatorIds).toHaveBeenCalledTimes(1)
      expect(mockGlobalRepo.insertGlobalIndicator).toHaveBeenCalledTimes(1)
      expect(mockGlobalRepo.insertGlobalIndicator).toHaveBeenCalledWith([{ key: "SAVING_APY_USG", args: usgAddress }])
      expect(mockGlobalRepo.insertGlobalIndicatorValue).toHaveBeenCalledTimes(1)
    })

    it("should handle case-insensitive token matching", async () => {
      // Arrange
      const nowBC = new Date()
      const within7Days = new Date(nowBC.getTime() - 2 * 24 * 60 * 60 * 1000)

      const tanAddress = "0xTAN"

      const events = [
        // Test with mixed case tokens
        { token: "0xtan", gain: "1000000000000000000", block_date: within7Days },
        { token: "0xusg", gain: "500000000000000000", block_date: within7Days },
      ]

      ;(mockSavingAccountRepository.findEventsAfterDate as any).mockResolvedValue(events)

      const mockGlobalRepo = {
        getGlobalIndicatorIds: vi.fn().mockResolvedValue(
          new Map<string, bigint>([
            ["SAVING_APY_TAN", 11n],
            ["SAVING_APY_USG", 22n],
          ])
        ),
        insertGlobalIndicator: vi.fn(),
        insertGlobalIndicatorValue: vi.fn(),
      } as any

      // Act
      await savingAccountService.processSavingAccountApy(mockGlobalRepo, nowBC, tanAddress)

      // Assert
      expect(mockGlobalRepo.insertGlobalIndicatorValue).toHaveBeenCalledTimes(1)

      const callArg = (mockGlobalRepo.insertGlobalIndicatorValue as any).mock.calls[0][0]
      expect(callArg).toHaveLength(2)

      // Both tokens should be processed despite case differences
      const byIndicator = new Map<bigint, { value: number }>()
      for (const row of callArg) {
        byIndicator.set(row.global_indicator_id, { value: row.value })
      }

      expect(byIndicator.get(11n)!.value).toBeCloseTo(1 / 52, 10) // TAN
      expect(byIndicator.get(22n)!.value).toBeCloseTo(0.5 / 52, 10) // USG
    })
  })
})
