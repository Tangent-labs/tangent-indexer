import { describe, it, expect, vi, beforeEach } from "vitest"
import { JsonRpcProvider } from "ethers"
import { PricePointService } from "../../services/PricePointService"
import { PriceInfo, PriceSource } from "../../type/data"
import PriceApiService from "../../services/PriceAPiService"
import { chainView } from "../../utils/chainView"

// Mock dependencies
vi.mock("../../db/PriceRepository")
vi.mock("../../services/PriceAPiService")
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

describe("PricePointService", () => {
  let pricePointService: PricePointService
  let mockPriceRepository: any
  let mockProvider: JsonRpcProvider
  let mockPriceApiService: any

  const mockPriceSources: PriceSource[] = [
    {
      address: "0x1000000000000000000000000000000000000001",
      name: "USDC",
      type: "llamaApi",
    },
    {
      address: "0x2000000000000000000000000000000000000002",
      name: "Curve Pool",
      type: "curveApi",
    },
    {
      address: "0x3000000000000000000000000000000000000003",
      name: "Pendle Token",
      type: "pendleApi",
    },
    {
      address: "0x4000000000000000000000000000000000000004",
      name: "ERC4626 Vault",
      type: "ERC4626",
      refToken: "0x1000000000000000000000000000000000000001", // USDC
    },
  ]

  const mockChainViewPrices = {
    ervc4626shares: [
      {
        token: "0x4000000000000000000000000000000000000004",
        shares: BigInt("1050000000000000000"), // 1.05 shares per token
      },
    ] as [{ token: string; shares: bigint }],
    sUsgPrice: BigInt("1100000000000000000"), // 1.1 USG price
    usgPrice: BigInt("1000000000000000000"), // 1.0 USG price
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockPriceRepository = {
      getPriceSources: vi.fn().mockResolvedValue(mockPriceSources),
    }

    mockProvider = {} as JsonRpcProvider

    mockPriceApiService = {
      getLlamaPrice: vi.fn().mockResolvedValue([{ address: "0x1000000000000000000000000000000000000001", price: 1.0 }]),
      fetchCurveApiPrices: vi.fn().mockResolvedValue([{ address: "0x2000000000000000000000000000000000000002", price: 1.5 }]),
      fetchPendleApiPrices: vi.fn().mockResolvedValue([{ address: "0x3000000000000000000000000000000000000003", price: 2.0 }]),
    }

    // Mock the PriceApiService constructor
    vi.mocked(PriceApiService).mockImplementation(() => mockPriceApiService)

    pricePointService = new PricePointService(mockPriceRepository, mockProvider)
  })

  describe("constructor", () => {
    it("should initialize with dependencies", () => {
      expect(pricePointService.priceRepository).toBe(mockPriceRepository)
      expect(pricePointService.providers).toBe(mockProvider)
      expect(pricePointService.priceApiService).toBe(mockPriceApiService)
    })
  })

  describe("fetchPriceFeed", () => {
    it("should fetch and combine all price sources", async () => {
      vi.mocked(chainView).mockResolvedValue([mockChainViewPrices])

      const result = await pricePointService.fetchPriceFeed()

      expect(mockPriceRepository.getPriceSources).toHaveBeenCalledOnce()
      expect(mockPriceApiService.getLlamaPrice).toHaveBeenCalledWith(["0x1000000000000000000000000000000000000001"])
      expect(mockPriceApiService.fetchCurveApiPrices).toHaveBeenCalledWith(["0x2000000000000000000000000000000000000002"], "factory-stable-ng")
      expect(mockPriceApiService.fetchPendleApiPrices).toHaveBeenCalledWith(["0x3000000000000000000000000000000000000003"])
      expect(chainView).toHaveBeenCalled()

      // Should include all price types
      expect(result).toHaveLength(6) // 3 API prices + 1 ERC4626 + 2 USG/sUSG
      expect(result).toEqual(
        expect.arrayContaining([
          { address: "0x1000000000000000000000000000000000000001", price: 1.0 },
          { address: "0x2000000000000000000000000000000000000002", price: 1.5 },
          { address: "0x3000000000000000000000000000000000000003", price: 2.0 },
          { address: "0x4000000000000000000000000000000000000004", price: 1.05 }, // ERC4626 calculated price
          { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.0 }, // USG
          { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.1 }, // sUSG
        ])
      )
    })

    it("should handle empty price sources", async () => {
      mockPriceRepository.getPriceSources.mockResolvedValue([])
      vi.mocked(chainView).mockResolvedValue([{ ervc4626shares: [] as any, sUsgPrice: BigInt(0), usgPrice: BigInt(0) }])

      const result = await pricePointService.fetchPriceFeed()

      expect(result).toHaveLength(2) // Only USG and sUSG
      expect(result).toEqual([
        { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 0 },
        { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 0 },
      ])
    })

    it("should handle API errors gracefully", async () => {
      vi.spyOn(mockPriceApiService, "getLlamaPrice").mockImplementation(() => {
        throw new Error("API error")
      })
      vi.spyOn(mockPriceApiService, "fetchCurveApiPrices").mockImplementation(() => {
        throw new Error("API error")
      })
      vi.spyOn(mockPriceApiService, "fetchPendleApiPrices").mockImplementation(() => {
        throw new Error("API error")
      })

      vi.mocked(chainView).mockResolvedValue([{ ervc4626shares: [] as any, sUsgPrice: BigInt(0), usgPrice: BigInt(0) }])

      const result = await pricePointService.fetchPriceFeed()

      expect(result).toHaveLength(2) // Only USG and sUSG
      expect(result).toEqual([
        { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 0 },
        { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 0 },
      ])
    })
  })

  describe("processErc4626Prices", () => {
    it("should calculate ERC4626 prices correctly", () => {
      const apiPrices: PriceInfo[] = [
        { address: "0x1000000000000000000000000000000000000001", price: 1.0 }, // USDC reference
      ]

      pricePointService.processErc4626Prices(mockPriceSources, mockChainViewPrices, apiPrices)

      // Should add ERC4626 price to apiPrices
      expect(apiPrices).toContainEqual({
        address: "0x4000000000000000000000000000000000000004",
        price: 1.05, // 1.05 shares * 1.0 USD price
      })
    })

    it("should handle missing reference token", () => {
      const priceSourcesWithoutRef = [
        {
          address: "0x4000000000000000000000000000000000000004",
          name: "ERC4626 Vault",
          type: "ERC4626" as const,
          // No refToken
        },
      ]

      const apiPrices: PriceInfo[] = []

      pricePointService.processErc4626Prices(priceSourcesWithoutRef, mockChainViewPrices, apiPrices)

      expect(apiPrices).toContainEqual({
        address: "0x4000000000000000000000000000000000000004",
        price: 0, // No reference token found
      })
    })

    it("should handle missing reference price", () => {
      const apiPrices: PriceInfo[] = [
        // No USDC price in apiPrices
      ]

      pricePointService.processErc4626Prices(mockPriceSources, mockChainViewPrices, apiPrices)

      expect(apiPrices).toContainEqual({
        address: "0x4000000000000000000000000000000000000004",
        price: 0, // No reference price found
      })
    })
  })

  describe("chainViewPrices", () => {
    it("should call chainView with correct parameters", async () => {
      const erc4626Addresses = ["0x4000000000000000000000000000000000000004"]
      vi.mocked(chainView).mockResolvedValue([mockChainViewPrices])

      const result = await pricePointService.chainViewPrices(erc4626Addresses)

      expect(chainView).toHaveBeenCalledWith(
        mockProvider,
        expect.any(Array), // ABI
        expect.any(String), // bytecode
        [
          erc4626Addresses,
          {
            usg: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B",
            usgOracle: "0x600F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B",
            sUsg: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B",
            pegKeepers: ["0x700F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", "0x800F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B"],
          },
        ]
      )

      expect(result).toEqual(mockChainViewPrices)
    })

    it("should handle chainView errors", async () => {
      const erc4626Addresses = ["0x4000000000000000000000000000000000000004"]
      vi.mocked(chainView).mockRejectedValue(new Error("Chain view error"))

      await expect(pricePointService.chainViewPrices(erc4626Addresses)).rejects.toThrow("Chain view error")
    })
  })

  describe("insertPrices", () => {
    it("should return empty array for now", async () => {
      const prices: PriceInfo[] = [{ address: "0x1000000000000000000000000000000000000001", price: 1.0 }]

      const result = await pricePointService.insertPrices(prices)

      expect(result).toEqual([])
    })
  })
})
