import { beforeEach, describe, expect, it, vi } from "vitest"
import { PrismaClient } from "@prisma/client"

import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository"
import { UserAction } from "services/events/UserMarketService"

// Import the mock version of Prisma
export const prismaMock = {
  active_borrowers: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    createMany: vi.fn(),
  },
}
// Mock PrismaClient and ensure all instances return our mock
vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}))

describe("ActiveBorrowersRepository", () => {
  let repository: ActiveBorrowersRepository

  beforeEach(() => {
    vi.resetAllMocks()
    // Inject the mocked Prisma client into the repository
    repository = new ActiveBorrowersRepository(prismaMock as unknown as PrismaClient)
  })

  it("should delete borrowers that exist in the database", async () => {
    prismaMock.active_borrowers.findMany.mockResolvedValue([
      { borrower_address: "Alice", contract_address: "Market1" },
      { borrower_address: "Bob", contract_address: "Market2" },
      { borrower_address: "Alice", contract_address: "Market2" },
    ])

    const inputData: UserAction[] = [
      { user: "Alice", market: "Market1", blockId: 12 },
      { user: "Charlie", market: "Market3", blockId: 13 }, // Should be ignored (not in DB)
    ]

    await repository.deleteActiveBorrowers(inputData)

    expect(prismaMock.active_borrowers.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { borrower_address: { equals: "Alice", mode: "insensitive" }, contract_address: { equals: "Market1", mode: "insensitive" } },
          { borrower_address: { equals: "Charlie", mode: "insensitive" }, contract_address: { equals: "Market3", mode: "insensitive" } },
        ],
      },
    })
  })

  it("should delete multiple matched borrowers", async () => {
    prismaMock.active_borrowers.findMany.mockResolvedValue([
      { borrower_address: "Alice", contract_address: "Market1" },
      { borrower_address: "Alice", contract_address: "Market2" },
      { borrower_address: "Bob", contract_address: "Market2" },
      { borrower_address: "Bob", contract_address: "Market3" },
      { borrower_address: "Charlie", contract_address: "Market3" },
    ])

    const inputData: UserAction[] = [
      { user: "Alice", market: "Market1", blockId: 12 },
      { user: "Bob", market: "Market2", blockId: 13 },
    ]

    await repository.deleteActiveBorrowers(inputData)

    expect(prismaMock.active_borrowers.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { borrower_address: { equals: "Alice", mode: "insensitive" }, contract_address: { equals: "Market1", mode: "insensitive" } },
          { borrower_address: { equals: "Bob", mode: "insensitive" }, contract_address: { equals: "Market2", mode: "insensitive" } },
        ],
      },
    })
  })
})
