import { describe, it, expect, beforeEach, vi } from "vitest"
import { SavingAccountServices } from "../../services/events/SavingAccountServices.js"
import { SavingAccountRepository } from "../../db/SavingAccountRepository.js"
import { ProcessReportEvent } from "../../eventFectcher/savingAccountEventFetcher.js"

// Mock du repository
const mockSavingAccountRepository = {
  saveEvents: vi.fn(),
} as unknown as SavingAccountRepository

describe("SavingAccountServices", () => {
  let savingAccountService: SavingAccountServices

  beforeEach(() => {
    vi.clearAllMocks()
    savingAccountService = new SavingAccountServices(mockSavingAccountRepository)
  })

  describe("processSavingAccountEvents", () => {
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
      const result = savingAccountService.processSavingAccountEvents(mockEvents, mockBlockTimestamps)

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
      const result = savingAccountService.processSavingAccountEvents(mockEvents, mockBlockTimestamps)

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
})
