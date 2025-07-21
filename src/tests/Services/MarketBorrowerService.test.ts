import { describe, it, expect, vi } from "vitest"
import { ActiveBorrowersService } from "../../services/ActiveBorrowersService"
import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository"
import { UserAction } from "services/events/UserMarketService"

vi.mock("../../eventFectcher/marketBorrowerEventFetcher", () => ({
  fetchBorrowLogs: vi.fn(),
}))

describe("MarketBorrowerService", () => {
  it("should sort properly the market/user to insert and delete", async () => {
    const activeBorrowersRepository = {
      deleteActiveBorrowers: vi.fn(),
      insertActiveBorrowers: vi.fn(),
    } as any as ActiveBorrowersRepository

    const activeBorrowersService = new ActiveBorrowersService(activeBorrowersRepository)

    const mockLogs: UserAction[] = [
      { user: "0xBorrower1", marketId: 1, blockId: 12, debt_shares: 12n },
      { user: "0xBorrower2", marketId: 2, blockId: 12, debt_shares: 1000n },
      { user: "0xBorrower2", marketId: 2, blockId: 12, debt_shares: 0n },
      { user: "0xBorrower1", marketId: 2, blockId: 20, debt_shares: 1000n },
      { user: "0xBorrower1", marketId: 2, blockId: 22, debt_shares: 4n },
    ]

    const expectedInserted: UserAction[] = [
      { user: "0xBorrower1", marketId: 1, blockId: 12, debt_shares: 12n },
      { user: "0xBorrower1", marketId: 2, blockId: 22, debt_shares: 4n },
    ]

    const { inserted, deleted } = await activeBorrowersService.updateActiveBorrowers(mockLogs)

    expect(activeBorrowersRepository.deleteActiveBorrowers).toHaveBeenCalledWith(deleted)
    expect(activeBorrowersRepository.insertActiveBorrowers).toHaveBeenCalledWith(inserted)

    deleted.forEach((item, i) => {
      const log = mockLogs[i]
      expect(item.blockId).toBe(log.blockId)
      expect(item.marketId).toBe(log.marketId)
      expect(item.user).toBe(log.user)
      expect(item.debt_shares).toBe(log.debt_shares)
      expect(item.timestamp).toBe(log.timestamp)
    })

    inserted.forEach((item, i) => {
      const log = expectedInserted[i]
      expect(item.blockId).toBe(log.blockId)
      expect(item.marketId).toBe(log.marketId)
      expect(item.user).toBe(log.user)
      expect(item.debt_shares).toBe(log.debt_shares)
      expect(item.timestamp).toBe(log.timestamp)
    })

    expect(deleted.length).toBe(5)
    expect(inserted.length).toBe(2)
  })
})
