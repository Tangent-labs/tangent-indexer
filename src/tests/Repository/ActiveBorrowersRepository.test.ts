import { beforeEach, describe, expect, it, vi } from "vitest"
import { PrismaClient } from "@prisma/client"

import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository.js"
import { UserAction } from "../../services/events/UserMarketService.js"

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
      {
        market: {
          id: 1n,
          collateral_address: "0x1",
          contract_address: "Market1",
          contract_name: "A",
          contract_type: "Convex CRV",
        },
        borrower_address: "Alice",
      },

      {
        market: {
          id: 2n,
          collateral_address: "0x2",
          contract_address: "Market2",
          contract_name: "A",
          contract_type: "Convex CRV",
        },
        borrower_address: "Bob",
      },

      {
        market: {
          id: 2n,
          collateral_address: "0x2",
          contract_address: "Market2",
          contract_name: "A",
          contract_type: "Convex CRV",
        },
        borrower_address: "Alice",
      },
    ])

    const inputData: UserAction[] = [
      { user: "Alice", marketId: 1, blockId: 12, debt_shares: 100n },
      { user: "Charlie", marketId: 3, blockId: 13, debt_shares: 200n }, // Should be ignored (not in DB)
    ]

    await repository.deleteActiveBorrowers(inputData)

    expect(prismaMock.active_borrowers.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { borrower_address: { equals: "Alice", mode: "insensitive" }, market_id: { equals: 1 } },
          { borrower_address: { equals: "Charlie", mode: "insensitive" }, market_id: { equals: 3 } },
        ],
      },
    })
  })

  it("should delete multiple matched borrowers", async () => {
    prismaMock.active_borrowers.findMany.mockResolvedValue([
      {
        market: {
          id: 1n,
          collateral_address: "0x1",
          contract_address: "Market1",
          contract_name: "A",
          contract_type: "Convex CRV",
        },
        borrower_address: "Alice",
      },
      {
        market: {
          id: 1n,
          collateral_address: "0x1",
          contract_address: "Market2",
          contract_name: "A",
          contract_type: "Convex CRV",
        },
        borrower_address: "Alice",
      },
      {
        market: {
          id: 1n,
          collateral_address: "0x1",
          contract_address: "Market2",
          contract_name: "A",
          contract_type: "Convex CRV",
        },
        borrower_address: "Bob",
      },
      {
        market: {
          id: 1n,
          collateral_address: "0x1",
          contract_address: "Market3",
          contract_name: "A",
          contract_type: "Convex CRV",
        },
        borrower_address: "Bob",
      },
      {
        market: {
          id: 1n,
          collateral_address: "0x1",
          contract_address: "Market3",
          contract_name: "A",
          contract_type: "Convex CRV",
        },
        borrower_address: "Charlie",
      },
    ])

    const inputData: UserAction[] = [
      { user: "Alice", marketId: 1, blockId: 12, debt_shares: 100n },
      { user: "Bob", marketId: 2, blockId: 13, debt_shares: 100n },
    ]

    await repository.deleteActiveBorrowers(inputData)

    expect(prismaMock.active_borrowers.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { borrower_address: { equals: "Alice", mode: "insensitive" }, market_id: { equals: 1 } },
          { borrower_address: { equals: "Bob", mode: "insensitive" }, market_id: { equals: 2 } },
        ],
      },
    })
  })
})
