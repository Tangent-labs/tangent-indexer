import { describe, it, expect, vi } from "vitest"
import { JsonRpcProvider } from "ethers"
import { MarketContractsRepository } from "../../db/MarketContractsRepository.js"
import { fetchMarketCreationLogs } from "../../eventFectcher/marketCreationEventFectcher.js"
import { MarketCreationService } from "../../services/events/MarketCreationService.js"
import { UserPointsLPRepository } from "../../db/Points/UserPointsLPRepository.js"
import { ERC20Repository } from "../../db/ERC20Repository.js"
import { BlockService } from "../../../src/services/BlockService.js"

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
    } as any as UserPointsLPRepository

    const erc20Repository = {
      insertManyERC20ToTrack: vi.fn(),
      insertAndReturnManyPriceSource: vi.fn(),
    } as any as ERC20Repository
    const insertAndReturnManyPriceSourceSpy = vi.spyOn(erc20Repository as any, "insertAndReturnManyPriceSource")

    const blockService = {
      fetchBlockTimestamps: vi.fn(),
    } as any as BlockService
    const fetchblockTimestamps = vi.spyOn(blockService as any, "fetchBlockTimestamps")

    const marketCreationService = new MarketCreationService(
      mockMarketContractsRepository as any as MarketContractsRepository,
      "COUCOU",
      userPointsRepository,
      erc20Repository
    )

    insertAndReturnManyPriceSourceSpy.mockResolvedValue([
      { name: "Debt 0xMarket1", id: 12n, address: "market", type: "chainview", reference: null },
      { name: "Debt 0xMarket2", id: 13n, address: "market", type: "chainview", reference: null },
    ])

    fetchblockTimestamps.mockResolvedValue([])

    const mockProvider = {} as JsonRpcProvider
    const startingBlock = 1000
    const endingBlock = 2000

    const mockLogs = [
      { contract_address: "0xMarket1", collateral_address: "0xCollat1", contract_type: "ConvexCrv" },
      { contract_address: "0xMarket2", collateral_address: "0xCollat2", contract_type: "ConvexFxn" },
    ]

    ;(fetchMarketCreationLogs as any).mockResolvedValue(mockLogs)

    await marketCreationService.runDetection(mockProvider, startingBlock, endingBlock, blockService)

    expect(fetchMarketCreationLogs).toHaveBeenCalledWith(mockProvider, startingBlock, endingBlock, "COUCOU", blockService)
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
    } as any as UserPointsLPRepository

    const erc20Repository = {
      insertManyERC20ToTrack: vi.fn(),
    } as any as ERC20Repository
    const marketCreationService = new MarketCreationService(
      mockMarketContractsRepository as any as MarketContractsRepository,
      "COUCOU",
      userPointsRepository,
      erc20Repository
    )

    const blockService = {
      fetchBlockTimestamps: vi.fn(),
    } as any as BlockService
    const fetchblockTimestamps = vi.spyOn(blockService as any, "fetchBlockTimestamps")

    fetchblockTimestamps.mockResolvedValue([])

    const mockProvider = {} as JsonRpcProvider
    const startingBlock = 1000
    const endingBlock = 2000

    ;(fetchMarketCreationLogs as any).mockResolvedValue([])

    await marketCreationService.runDetection(mockProvider, startingBlock, endingBlock, blockService)

    expect(mockMarketContractsRepository.getContractsInList).not.toHaveBeenCalled()
    expect(mockMarketContractsRepository.insertContracts).not.toHaveBeenCalled()
  })
})
