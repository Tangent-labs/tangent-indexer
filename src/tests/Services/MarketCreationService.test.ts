import { describe, it, expect, vi } from "vitest"
import { MarketCreationService } from "../../services/MarketCreationService"
import { MarketContractsRepository } from "../../db/MarketContractsRepository"
import { JsonRpcProvider } from "ethers"
import { indexerConfig } from "../../config/indexer_config"
import { fetchMarketCreationLogs } from "../../eventFectcher/marketCreationEventFectcher"

vi.mock("../../eventFectcher/marketCreationEventFectcher", () => ({
  fetchMarketCreationLogs: vi.fn(),
}))

describe("MarketCreationService", () => {
  it("should insert non-existing contracts from logs", async () => {
    const mockMarketContractsRepository = {
      insertNonExistingContractsFromLogs: vi.fn(),
    }

    const marketCreationService = new MarketCreationService(mockMarketContractsRepository as any as MarketContractsRepository)

    const mockProvider = {} as JsonRpcProvider
    const startingBlock = 1000
    const endingBlock = 2000
    const marketCreatorAddress = indexerConfig.contracts.marketCreatorAddress

    const mockLogs = [
      { address: "0xMarket1", blockNumber: 1001 },
      { address: "0xMarket2", blockNumber: 1002 },
    ]

    ;(fetchMarketCreationLogs as any).mockResolvedValue(mockLogs)

    await marketCreationService.runDetection(mockProvider, startingBlock, endingBlock)

    expect(fetchMarketCreationLogs).toHaveBeenCalledWith(mockProvider, startingBlock, endingBlock, marketCreatorAddress)
    expect(mockMarketContractsRepository.insertNonExistingContractsFromLogs).toHaveBeenCalledWith(mockLogs)
  })

  it("should not insert contracts if no logs are fetched", async () => {
    const mockMarketContractsRepository = {
      insertNonExistingContractsFromLogs: vi.fn(),
    }

    const marketCreationService = new MarketCreationService(mockMarketContractsRepository as any as MarketContractsRepository)

    const mockProvider = {} as JsonRpcProvider
    const startingBlock = 1000
    const endingBlock = 2000

    ;(fetchMarketCreationLogs as any).mockResolvedValue([])

    await marketCreationService.runDetection(mockProvider, startingBlock, endingBlock)

    expect(mockMarketContractsRepository.insertNonExistingContractsFromLogs).not.toHaveBeenCalled()
  })
})
