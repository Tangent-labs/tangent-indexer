import { describe, it, expect, vi } from "vitest"
import { JsonRpcProvider } from "ethers"
import { MarketContractsRepository } from "../../db/MarketContractsRepository.js"
import { fetchMarketCreationLogs } from "../../eventFectcher/marketCreationEventFectcher.js"
import { MarketCreationService } from "../../services/events/MarketCreationService.js"
import { UserPointsRepository } from "../../db/UserPointsRepository.js"
import { ERC20Repository } from "../../db/ERC20Repository.js"

vi.mock("../../eventFectcher/marketCreationEventFectcher", () => ({
  fetchMarketCreationLogs: vi.fn(),
}))

describe("MarketCreationService", () => {
  it("should insert non-existing contracts from logs", async () => {
    const mockMarketContractsRepository = {
      insertContracts: vi.fn(),
    }
    const userPointsRepository = {
      insertLpTasks: vi.fn(),
    } as any as UserPointsRepository

    const erc20Repository = {
      insertManyERC20ToTrack: vi.fn(),
    } as any as ERC20Repository

    const marketCreationService = new MarketCreationService(
      mockMarketContractsRepository as any as MarketContractsRepository,
      "COUCOU",
      userPointsRepository,
      erc20Repository
    )

    const mockProvider = {} as JsonRpcProvider
    const startingBlock = 1000
    const endingBlock = 2000

    const mockLogs = [
      { contract_address: "0xMarket1", collateral_address: "0xCollat1", contract_type: "ConvexCrv" },
      { contract_address: "0xMarket2", collateral_address: "0xCollat2", contract_type: "ConvexFxn" },
    ]

    ;(fetchMarketCreationLogs as any).mockResolvedValue(mockLogs)

    await marketCreationService.runDetection(mockProvider, startingBlock, endingBlock)

    expect(fetchMarketCreationLogs).toHaveBeenCalledWith(mockProvider, startingBlock, endingBlock, "COUCOU")
    expect(mockMarketContractsRepository.insertContracts).toHaveBeenCalledWith([
      { contract_address: "0xmarket1", collateral_address: "0xcollat1", contract_type: "ConvexCrv" },
      { contract_address: "0xmarket2", collateral_address: "0xcollat2", contract_type: "ConvexFxn" },
    ])
  })

  it("should not insert contracts if no logs are fetched", async () => {
    const mockMarketContractsRepository = {
      getContractsInList: vi.fn(),
      insertContracts: vi.fn(),
    }

    const userPointsRepository = {
      insertLpTasks: vi.fn(),
    } as any as UserPointsRepository

    const erc20Repository = {
      insertManyERC20ToTrack: vi.fn(),
    } as any as ERC20Repository
    const marketCreationService = new MarketCreationService(
      mockMarketContractsRepository as any as MarketContractsRepository,
      "COUCOU",
      userPointsRepository,
      erc20Repository
    )

    const mockProvider = {} as JsonRpcProvider
    const startingBlock = 1000
    const endingBlock = 2000

    ;(fetchMarketCreationLogs as any).mockResolvedValue([])

    await marketCreationService.runDetection(mockProvider, startingBlock, endingBlock)

    expect(mockMarketContractsRepository.getContractsInList).not.toHaveBeenCalled()
    expect(mockMarketContractsRepository.insertContracts).not.toHaveBeenCalled()
  })
})
