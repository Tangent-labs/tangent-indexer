import { beforeEach, describe, expect, it, vi } from "vitest"
import { PrismaClient } from "@prisma/client"

import { MarketContractsRepository } from "../../db/MarketContractsRepository"
import { MarketCreationEvent } from "eventFectcher/marketCreationEventFectcher"

// Import the mock version of Prisma
export const prismaMock = {
  market_contracts: {
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

describe("MarketContractsRepository", () => {
  let repository: MarketContractsRepository

  beforeEach(() => {
    vi.resetAllMocks()
    // Inject the mocked Prisma client into the repository
    repository = new MarketContractsRepository(prismaMock as unknown as PrismaClient)
  })

  it("should not insert  many if all contracts  exist", async () => {
    prismaMock.market_contracts.findMany.mockResolvedValue([{ contract_address: "Market1" }, { contract_address: "Market3" }])
    const logs: MarketCreationEvent[] = [
      { address: "Market1", marketType: "ConvexCrv", blockNumber: 1 },
      { address: "Market3", marketType: "ConvexFxn", blockNumber: 2 },
    ]
    await repository.insertNonExistingContractsFromLogs(logs)
    expect(prismaMock.market_contracts.createMany).not.toHaveBeenCalled()
  })

  it("should insert  many if all contracts not exist", async () => {
    // Mock existing contracts (so nothing should be inserted)
    prismaMock.market_contracts.findMany.mockResolvedValue([{ contract_address: "Market1" }, { contract_address: "Market3" }])

    const logs: MarketCreationEvent[] = [
      { address: "Market1", marketType: "ConvexCrv", blockNumber: 1 },
      { address: "Market2", marketType: "ConvexFxn", blockNumber: 2 },
      { address: "Market4", marketType: "ConvexFxn", blockNumber: 2 },
    ]

    await repository.insertNonExistingContractsFromLogs(logs)

    // Expect createMany to NOT be called
    expect(prismaMock.market_contracts.createMany).toHaveBeenCalledWith({
      data: [
        { contract_address: "Market2", contract_type: "ConvexFxn" },
        { contract_address: "Market4", contract_type: "ConvexFxn" },
      ],
    })
  })
})
