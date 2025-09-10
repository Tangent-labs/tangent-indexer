import { describe, it, expect, vi, beforeEach } from "vitest"
import { JsonRpcProvider } from "ethers"
import { PricePointService } from "../../services/PricePointService"
import { PriceApiInfo, PriceSource } from "../../type/data"
import PriceApiService from "../../services/PriceApiService"
import { chainView } from "../../utils/chainView"

// Mock dependencies (including console for error logging)
vi.mock("../../db/PriceRepository")
vi.mock("../../db/MarketContractsRepository")
vi.mock("../../services/PriceApiService")
vi.mock("../../utils/chainView")
vi.mock("../../addresses.json", () => ({
  default: {
    tokens: {
      USG: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B",
      sUSG: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B",
    },
    oracles: {
      USG: "0x600F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B",
    },
    pegKeepers: {
      pegKeeper1: "0x700F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B",
      pegKeeper2: "0x800F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B",
    },
  },
}))

const mockConsole = {
  error: vi.spyOn(console, "error").mockImplementation(() => {}),
}

describe("PricePointService", () => {
  let pricePointService: PricePointService
  let mockPriceRepository: any
  let mockMarketContractsRepository: any
  let mockProvider: JsonRpcProvider
  let mockPriceApiService: any

  const mockPriceSources: PriceSource[] = [
    { address: "0x1000000000000000000000000000000000000001", name: "USDC", type: "llamaApi", ref_token: null, id: BigInt(1) },
    { address: "0x2000000000000000000000000000000000000002", name: "Curve Pool", type: "curveApi", ref_token: null, id: BigInt(2) },
    { address: "0x3000000000000000000000000000000000000003", name: "Pendle Token", type: "pendleApi", ref_token: null, id: BigInt(3) },
    {
      address: "0x4000000000000000000000000000000000000004",
      name: "ERC4626 Vault",
      type: "ERC4626",
      ref_token: "0x1000000000000000000000000000000000000001",
      id: BigInt(4),
    },
  ]

  const mockMarkets = ["0x9000000000000000000000000000000000000001", "0x9000000000000000000000000000000000000002"]

  const mockChainViewPrices = {
    ervc4626shares: [{ token: "0x4000000000000000000000000000000000000004", shares: BigInt("1050000000000000000") }],
    sUsgPrice: BigInt("1100000000000000000"),
    usgPrice: BigInt("1000000000000000000"),
    debtIndexes: [
      { market: "0x9000000000000000000000000000000000000001", index: BigInt("1200000000000000000") },
      { market: "0x9000000000000000000000000000000000000002", index: BigInt("1150000000000000000") },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockConsole.error.mockClear()

    mockPriceRepository = {
      getPriceSources: vi.fn().mockResolvedValue(mockPriceSources),
      insertPriceFeed: vi.fn().mockResolvedValue([]),
    }

    mockMarketContractsRepository = {
      getContracts: vi.fn().mockResolvedValue(mockMarkets.map((addr) => ({ contract_address: addr }))),
    }

    mockProvider = {} as JsonRpcProvider

    mockPriceApiService = {
      getLlamaPrice: vi.fn().mockResolvedValue([{ address: "0x1000000000000000000000000000000000000001", price: 1.0 }]),
      fetchCurveApiPrices: vi.fn().mockResolvedValue([{ address: "0x2000000000000000000000000000000000000002", price: 1.5 }]),
      fetchPendleApiPrices: vi.fn().mockResolvedValue([{ address: "0x3000000000000000000000000000000000000003", price: 2.0 }]),
    }

    vi.mocked(PriceApiService).mockImplementation(() => mockPriceApiService)

    pricePointService = new PricePointService(mockPriceRepository, mockMarketContractsRepository, mockProvider)

    // Override the priceApiService with our mock after construction
    pricePointService.priceApiService = mockPriceApiService
  })

  describe("getPriceFeeds", () => {
    it("should fetch and combine all price sources when ERC4626 is present", async () => {
      vi.mocked(chainView).mockResolvedValue([mockChainViewPrices])

      const result = await pricePointService.getPriceFeeds()

      expect(mockPriceRepository.getPriceSources).toHaveBeenCalledOnce()
      expect(mockMarketContractsRepository.getContracts).toHaveBeenCalledOnce()
      expect(mockPriceApiService.getLlamaPrice).toHaveBeenCalledWith(["0x1000000000000000000000000000000000000001"])
      expect(mockPriceApiService.fetchCurveApiPrices).toHaveBeenCalledWith(["0x2000000000000000000000000000000000000002"], "factory-stable-ng")
      expect(mockPriceApiService.fetchPendleApiPrices).toHaveBeenCalledWith(["0x3000000000000000000000000000000000000003"])
      expect(chainView).toHaveBeenCalled()
      expect(result.prices).toHaveLength(8) // 3 APIs + 1 ERC4626 + 2 USG/sUSG + 2 debt
      expect(result.warnings).toEqual([]) // No warnings expected
      expect(result.prices).toEqual(
        expect.arrayContaining([
          { address: "0x1000000000000000000000000000000000000001", price: 1.0 },
          { address: "0x2000000000000000000000000000000000000002", price: 1.5 },
          { address: "0x3000000000000000000000000000000000000003", price: 2.0 },
          { address: "0x4000000000000000000000000000000000000004", price: expect.any(Number) }, // ERC4626 calculated
          { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.0 },
          { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.1 },
          { address: "0x9000000000000000000000000000000000000001", price: 1.2 },
          { address: "0x9000000000000000000000000000000000000002", price: 1.15 },
        ])
      )
    })

    it("should not call chainView or add USG/sUSG/debt if no ERC4626 sources", async () => {
      mockPriceRepository.getPriceSources.mockResolvedValue(mockPriceSources.slice(0, 3)) // No ERC4626

      const result = await pricePointService.getPriceFeeds()

      expect(chainView).not.toHaveBeenCalled()
      expect(result.prices).toHaveLength(3) // Only APIs
      expect(result.warnings).toEqual([]) // No warnings expected
      expect(result.prices).not.toEqual(
        expect.arrayContaining([
          { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: expect.any(Number) },
          { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: expect.any(Number) },
        ])
      )
    })

    it("should handle empty price sources (no chainView, empty result)", async () => {
      mockPriceRepository.getPriceSources.mockResolvedValue([])

      const result = await pricePointService.getPriceFeeds()

      expect(chainView).not.toHaveBeenCalled()
      expect(result.prices).toEqual([]) // No sources, no chainView
      expect(result.warnings).toEqual([]) // No warnings
    })

    it("should handle promise setup errors and collect them as warnings", async () => {
      mockPriceApiService.getLlamaPrice.mockImplementation(() => {
        throw new Error("Setup error")
      })

      const result = await pricePointService.getPriceFeeds()

      expect(mockConsole.error).toHaveBeenCalledWith("Error fetching llama price", expect.any(Error))
      // With error resistance, other successful promises should still be processed
      expect(result.prices.length).toBeGreaterThan(0)
      expect(result.warnings).toEqual([]) // Setup errors don't create warnings in the result
    })

    it("should handle partial promise failures with allSettled and return warnings", async () => {
      mockPriceApiService.getLlamaPrice.mockRejectedValue(new Error("Llama failed"))
      vi.mocked(chainView).mockResolvedValue([mockChainViewPrices])

      const result = await pricePointService.getPriceFeeds()

      expect(result.prices.length).toBeGreaterThan(0) // Other promises succeed (Curve, Pendle, ERC4626)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toEqual({
        apiName: "Llama",
        error: expect.any(Error),
      })
      expect(result.warnings[0].error.message).toBe("Llama failed")
    })

    it("should handle all promises failing gracefully", async () => {
      mockPriceApiService.getLlamaPrice.mockRejectedValue(new Error("Llama failed"))
      mockPriceApiService.fetchCurveApiPrices.mockRejectedValue(new Error("Curve failed"))
      mockPriceApiService.fetchPendleApiPrices.mockRejectedValue(new Error("Pendle failed"))
      vi.mocked(chainView).mockRejectedValue(new Error("Chain view failed"))

      const result = await pricePointService.getPriceFeeds()

      expect(result.prices).toEqual([]) // All failed, so empty result
      expect(result.warnings).toHaveLength(4)
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          { apiName: "Llama", error: expect.any(Error) },
          { apiName: "Curve", error: expect.any(Error) },
          { apiName: "Pendle", error: expect.any(Error) },
          { apiName: "ERC4626", error: expect.any(Error) },
        ])
      )
    })

    // ... (keep other getPriceFeeds tests from previous version, adjusted for no USG/sUSG without ERC4626)
  })

  describe("fetchPriceFeed", () => {
    it("should fetch prices and insert them", async () => {
      vi.mocked(chainView).mockResolvedValue([mockChainViewPrices])
      const mockPrices = [{ address: "0x1000000000000000000000000000000000000001", price: 1.0 }]
      const mockResult = { prices: mockPrices, warnings: [] }
      vi.spyOn(pricePointService, "getPriceFeeds").mockResolvedValue(mockResult)

      await pricePointService.fetchPriceFeed()
      expect(pricePointService.getPriceFeeds).toHaveBeenCalled()
      expect(mockPriceRepository.insertPriceFeed).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            token: "0x1000000000000000000000000000000000000001",
            timestamp: expect.any(Date),
            price_usd: 1.0,
            address: "0x1000000000000000000000000000000000000001",
            price: 1.0,
          }),
        ])
      )
    })

    it("should handle empty prices", async () => {
      const mockResult = { prices: [], warnings: [] }
      vi.spyOn(pricePointService, "getPriceFeeds").mockResolvedValue(mockResult)
      await pricePointService.fetchPriceFeed()
      expect(mockPriceRepository.insertPriceFeed).not.toHaveBeenCalled()
    })
  })

  describe("processErc4626Prices", () => {
    it("should calculate ERC4626 prices with exact BigInt logic", () => {
      const apiPrices: PriceApiInfo[] = [{ address: "0x1000000000000000000000000000000000000001", price: 1.23456789 }]
      const chainViewWithShares = {
        ...mockChainViewPrices,
        ervc4626shares: [{ token: "0x4000000000000000000000000000000000000004", shares: BigInt("1050000000000000000") }],
      }

      pricePointService.processErc4626Prices(mockPriceSources, chainViewWithShares, apiPrices)

      // Exact calc: floor(1.23456789 * 1e18) = 1234567890000000000
      // (1050000000000000000 * 1234567890000000000) / 10^18 = 1296296284500000000000000000
      // Then / 1e18 = 1.2962962845
      expect(apiPrices).toContainEqual({ address: "0x4000000000000000000000000000000000000004", price: expect.closeTo(1.2962962845, 10) })
    })

    // ... (keep other processErc4626Prices tests from previous version)
  })

  describe("processErc4626WithChainView", () => {
    it("should call chainView and return output", async () => {
      const erc4626 = ["0x4000000000000000000000000000000000000004"]
      vi.mocked(chainView).mockResolvedValue([mockChainViewPrices])

      const result = await pricePointService.processErc4626WithChainView(erc4626, mockMarkets, mockPriceSources)

      expect(chainView).toHaveBeenCalledWith(mockProvider, expect.any(Array), expect.any(String), [
        erc4626,
        expect.any(Object),
        mockMarkets.map((addr) => addr.toLowerCase()),
      ])
      expect(result).toEqual(mockChainViewPrices)
    })

    it("should handle errors", async () => {
      vi.mocked(chainView).mockRejectedValue(new Error("Chain error"))

      await expect(pricePointService.processErc4626WithChainView([], [], [])).rejects.toThrow("Chain error")
    })
  })

  describe("processDebtIndexes", () => {
    it("should process debt indexes and add them to apiPrices array", () => {
      const chainViewPrices: any = {
        debtIndexes: [
          { market: "0x9000000000000000000000000000000000000001", index: BigInt("1200000000000000000") },
          { market: "0x9000000000000000000000000000000000000002", index: BigInt("1150000000000000000") },
        ],
      }
      const apiPrices: any[] = []

      pricePointService.processDebtIndexes(chainViewPrices, apiPrices)

      expect(apiPrices).toHaveLength(2)
      expect(apiPrices).toEqual(
        expect.arrayContaining([
          { address: "0x9000000000000000000000000000000000000001", price: 1.2 },
          { address: "0x9000000000000000000000000000000000000002", price: 1.15 },
        ])
      )
    })

    it("should handle empty debt indexes array", () => {
      const chainViewPrices: any = {
        debtIndexes: [],
      }
      const apiPrices: any[] = []

      pricePointService.processDebtIndexes(chainViewPrices, apiPrices)

      expect(apiPrices).toHaveLength(0)
    })

    it("should handle undefined chainViewPrices", () => {
      const apiPrices: any[] = []

      pricePointService.processDebtIndexes(undefined as any, apiPrices)

      expect(apiPrices).toHaveLength(0)
    })
  })
})
