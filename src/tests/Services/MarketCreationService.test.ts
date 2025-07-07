import { describe, it, expect, vi } from "vitest"
import { MarketCreationService } from "../../services/MarketCreationService"
import { MarketContractsRepository } from "../../db/MarketContractsRepository"
import { JsonRpcProvider } from "ethers"

import { fetchMarketCreationLogs } from "../../eventFectcher/marketCreationEventFectcher"
const marketCreatorAddress = "0xCreator"
vi.mock("../../eventFectcher/marketCreationEventFectcher", () => ({
  fetchMarketCreationLogs: vi.fn(),
}))

describe("MarketCreationService", () => {
  it("should insert non-existing contracts from logs", async () => {
    const mockMarketContractsRepository = {
      insertContracts: vi.fn(),
    }

    const marketCreationService = new MarketCreationService(mockMarketContractsRepository as any as MarketContractsRepository, marketCreatorAddress)

    const mockProvider = {} as JsonRpcProvider
    const startingBlock = 1000
    const endingBlock = 2000

    const mockLogs = [
      { contract_address: "0xMarket1", contract_type: "ConvexCrv" },
      { contract_address: "0xMarket2", contract_type: "ConvexFxn" },
    ]

    ;(fetchMarketCreationLogs as any).mockResolvedValue(mockLogs)

    await marketCreationService.runDetection(mockProvider, startingBlock, endingBlock)

    expect(fetchMarketCreationLogs).toHaveBeenCalledWith(mockProvider, startingBlock, endingBlock, marketCreatorAddress)
    expect(mockMarketContractsRepository.insertContracts).toHaveBeenCalledWith([
      { contract_address: "0xMarket1", contract_type: "ConvexCrv" },
      { contract_address: "0xMarket2", contract_type: "ConvexFxn" },
    ])
  })

  it("should not insert contracts if no logs are fetched", async () => {
    const mockMarketContractsRepository = {
      getContractsInList: vi.fn(),
      insertContracts: vi.fn(),
    }

    const marketCreationService = new MarketCreationService(mockMarketContractsRepository as any as MarketContractsRepository, marketCreatorAddress)

    const mockProvider = {} as JsonRpcProvider
    const startingBlock = 1000
    const endingBlock = 2000

    ;(fetchMarketCreationLogs as any).mockResolvedValue([])

    await marketCreationService.runDetection(mockProvider, startingBlock, endingBlock)

    expect(mockMarketContractsRepository.getContractsInList).not.toHaveBeenCalled()
    expect(mockMarketContractsRepository.insertContracts).not.toHaveBeenCalled()
  })
})
