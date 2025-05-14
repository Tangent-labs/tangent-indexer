import { beforeEach, describe, expect, it, vi } from "vitest"
import { PrismaClient } from "@prisma/client"

import { MarketBorrowerRepository } from "../../db/MarketBorrowerRepository"

// Import the mock version of Prisma
export const prismaMock = {
  market_borrower: {
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

describe("MarketBorrowerRepository", () => {
  let repository: MarketBorrowerRepository

  beforeEach(() => {
    vi.resetAllMocks()
    // Inject the mocked Prisma client into the repository
    repository = new MarketBorrowerRepository(prismaMock as unknown as PrismaClient)
  })

  it("should delete borrowers that exist in the database", async () => {
    prismaMock.market_borrower.findMany.mockResolvedValue([
      { borrower_address: "Alice", contract_address: "Market1" },
      { borrower_address: "Bob", contract_address: "Market2" },
      { borrower_address: "Alice", contract_address: "Market2" },
    ])

    const inputData = [
      { borrower: "Alice", market: "Market1" },
      { borrower: "Charlie", market: "Market3" }, // Should be ignored (not in DB)
    ]

    await repository.deleteMarketBorrowers(inputData)

    expect(prismaMock.market_borrower.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { borrower_address: { equals: "Alice", mode: "insensitive" }, contract_address: { equals: "Market1", mode: "insensitive" } },
          { borrower_address: { equals: "Charlie", mode: "insensitive" }, contract_address: { equals: "Market3", mode: "insensitive" } },
        ],
      },
    })
  })

  it("should delete multiple matched borrowers", async () => {
    prismaMock.market_borrower.findMany.mockResolvedValue([
      { borrower_address: "Alice", contract_address: "Market1" },
      { borrower_address: "Alice", contract_address: "Market2" },
      { borrower_address: "Bob", contract_address: "Market2" },
      { borrower_address: "Bob", contract_address: "Market3" },
      { borrower_address: "Charlie", contract_address: "Market3" },
    ])

    const inputData = [
      { borrower: "Alice", market: "Market1" },
      { borrower: "Bob", market: "Market2" },
    ]

    await repository.deleteMarketBorrowers(inputData)

    expect(prismaMock.market_borrower.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { borrower_address: { equals: "Alice", mode: "insensitive" }, contract_address: { equals: "Market1", mode: "insensitive" } },
          { borrower_address: { equals: "Bob", mode: "insensitive" }, contract_address: { equals: "Market2", mode: "insensitive" } },
        ],
      },
    })
  })

  it("should insert new borrowers and update existing ones", async () => {
    // Mock existing database records
    prismaMock.market_borrower.findMany.mockResolvedValue([{ borrower_address: "Alice", contract_address: "Market1" }])

    const inputData = [
      { borrower: "Alice", market: "Market1" }, // Should update check_date
      { borrower: "Bob", market: "Market2" }, // Should be inserted
    ]

    await repository.updateMarketBorrowers(inputData)

    // Expect createMany to be called for new borrowers
    expect(prismaMock.market_borrower.createMany).toHaveBeenCalledWith({
      data: [{ borrower_address: "Bob", contract_address: "Market2", check_date: expect.any(Date) }],
    })

    // Expect updateMany to be called for existing borrowers
    expect(prismaMock.market_borrower.updateMany).toHaveBeenCalledWith({
      where: { borrower_address: "Alice", contract_address: "Market1" },
      data: { check_date: expect.any(Date) },
    })
  })

  it("should not insert if all borrowers already exist", async () => {
    // Mock existing borrowers (so nothing should be inserted)
    prismaMock.market_borrower.findMany.mockResolvedValue([
      { borrower_address: "Alice", contract_address: "Market1" },
      { borrower_address: "Bob", contract_address: "Market2" },
    ])

    const inputData = [
      { borrower: "Alice", market: "Market1" }, // Should update check_date
      { borrower: "Bob", market: "Market2" }, // Should update check_date
    ]

    await repository.updateMarketBorrowers(inputData)

    // Expect createMany to NOT be called
    expect(prismaMock.market_borrower.createMany).not.toHaveBeenCalled()

    // Expect updateMany to be called twice (once per existing borrower)
    expect(prismaMock.market_borrower.updateMany).toHaveBeenCalledTimes(2)
    expect(prismaMock.market_borrower.updateMany).toHaveBeenCalledWith({
      where: { borrower_address: "Alice", contract_address: "Market1" },
      data: { check_date: expect.any(Date) },
    })
    expect(prismaMock.market_borrower.updateMany).toHaveBeenCalledWith({
      where: { borrower_address: "Bob", contract_address: "Market2" },
      data: { check_date: expect.any(Date) },
    })
  })
})
