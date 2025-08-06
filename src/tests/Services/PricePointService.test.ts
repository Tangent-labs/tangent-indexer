import { describe, it, expect, vi, beforeEach } from "vitest"
import { JsonRpcProvider } from "ethers"
import { PricePointService } from "../../services/PricePointService"
import { PriceInfo, PriceSource } from "../../type/data"
import PriceApiService from "../../services/PriceApiService"
import { chainView } from "../../utils/chainView"

// Mock dependencies
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

describe("PricePointService", () => {
  let pricePointService: PricePointService
  let mockPriceRepository: any
  let mockMarketContractsRepository: any
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

  const mockMarkets = [
    { contract_address: "0x9000000000000000000000000000000000000001", name: "Market 1" },
    { contract_address: "0x9000000000000000000000000000000000000002", name: "Market 2" },
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
    debtIndexes: [
      { market: "0x9000000000000000000000000000000000000001", index: BigInt("1200000000000000000") }, // 1.2 index
      { market: "0x9000000000000000000000000000000000000002", index: BigInt("1150000000000000000") }, // 1.15 index
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockPriceRepository = {
      getPriceSources: vi.fn().mockResolvedValue(mockPriceSources),
      insertPriceFeed: vi.fn().mockResolvedValue([]),
    }

    mockMarketContractsRepository = {
      getContracts: vi.fn().mockResolvedValue(mockMarkets),
    }

    mockProvider = {} as JsonRpcProvider

    mockPriceApiService = {
      getLlamaPrice: vi.fn().mockResolvedValue([{ address: "0x1000000000000000000000000000000000000001", price: 1.0 }]),
      fetchCurveApiPrices: vi.fn().mockResolvedValue([{ address: "0x2000000000000000000000000000000000000002", price: 1.5 }]),
      fetchPendleApiPrices: vi.fn().mockResolvedValue([{ address: "0x3000000000000000000000000000000000000003", price: 2.0 }]),
    }

    // Mock the PriceApiService constructor
    vi.mocked(PriceApiService).mockImplementation(() => mockPriceApiService)

    pricePointService = new PricePointService(mockPriceRepository, mockMarketContractsRepository, mockProvider)
  })

  describe("constructor", () => {
    it("should initialize with dependencies", () => {
      expect(pricePointService.priceRepository).toBe(mockPriceRepository)
      expect(pricePointService.marketContractsRepository).toBe(mockMarketContractsRepository)
      expect(pricePointService.providers).toBe(mockProvider)
      expect(pricePointService.priceApiService).toBe(mockPriceApiService)
    })
  })

  describe("fetchPriceFeed", () => {
    it("should fetch and combine all price sources", async () => {
      vi.mocked(chainView).mockResolvedValue([mockChainViewPrices])

      const result = await pricePointService.fetchPriceFeed()

      expect(mockPriceRepository.getPriceSources).toHaveBeenCalledOnce()
      expect(mockMarketContractsRepository.getContracts).toHaveBeenCalledOnce()
      expect(mockPriceApiService.getLlamaPrice).toHaveBeenCalledWith(["0x1000000000000000000000000000000000000001"])
      expect(mockPriceApiService.fetchCurveApiPrices).toHaveBeenCalledWith(["0x2000000000000000000000000000000000000002"], "factory-stable-ng")
      expect(mockPriceApiService.fetchPendleApiPrices).toHaveBeenCalledWith(["0x3000000000000000000000000000000000000003"])
      expect(chainView).toHaveBeenCalled()

      // Should include all price types
      expect(result).toHaveLength(8) // 3 API prices + 1 ERC4626 + 2 USG/sUSG + 2 debt indexes
      expect(result).toEqual(
        expect.arrayContaining([
          { address: "0x1000000000000000000000000000000000000001", price: 1.0 },
          { address: "0x2000000000000000000000000000000000000002", price: 1.5 },
          { address: "0x3000000000000000000000000000000000000003", price: 2.0 },
          { address: "0x4000000000000000000000000000000000000004", price: 1.05 }, // ERC4626 calculated price
          { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.0 }, // USG
          { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.1 }, // sUSG
          { address: "0x9000000000000000000000000000000000000001", price: 1.2 }, // Market 1 debt index
          { address: "0x9000000000000000000000000000000000000002", price: 1.15 }, // Market 2 debt index
        ])
      )
    })

    it("should handle empty price sources", async () => {
      mockPriceRepository.getPriceSources.mockResolvedValue([])
      vi.mocked(chainView).mockResolvedValue([{ ervc4626shares: [] as any, sUsgPrice: BigInt(0), usgPrice: BigInt(0), debtIndexes: [] }])

      const result = await pricePointService.fetchPriceFeed()

      expect(result).toHaveLength(2) // Only USG and sUSG when no price sources
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

      vi.mocked(chainView).mockResolvedValue([{ ervc4626shares: [] as any, sUsgPrice: BigInt(0), usgPrice: BigInt(0), debtIndexes: [] }])

      const result = await pricePointService.fetchPriceFeed()

      expect(result).toHaveLength(2) // Only USG and sUSG when API calls fail
      expect(result).toEqual([
        { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 0 },
        { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 0 },
      ])
    })

    it("should handle partial API failures", async () => {
      // Only llama API fails, others succeed
      vi.spyOn(mockPriceApiService, "getLlamaPrice").mockImplementation(() => {
        throw new Error("Llama API down")
      })

      vi.mocked(chainView).mockResolvedValue([mockChainViewPrices])

      const result = await pricePointService.fetchPriceFeed()

      // Should still get curve, pendle, ERC4626 (with 0 price due to missing reference), USG, sUSG, and debt index prices
      expect(result).toHaveLength(7)
      expect(result).toEqual(
        expect.arrayContaining([
          { address: "0x2000000000000000000000000000000000000002", price: 1.5 }, // Curve
          { address: "0x3000000000000000000000000000000000000003", price: 2.0 }, // Pendle
          { address: "0x4000000000000000000000000000000000000004", price: 0 }, // ERC4626 - no reference price since llama failed
          { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.0 }, // USG
          { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.1 }, // sUSG
          { address: "0x9000000000000000000000000000000000000001", price: 1.2 }, // Market 1 debt index
          { address: "0x9000000000000000000000000000000000000002", price: 1.15 }, // Market 2 debt index
        ])
      )
    })

    it("should handle only llama price sources", async () => {
      const llamaOnlyPriceSources = [
        {
          address: "0x1000000000000000000000000000000000000001",
          name: "USDC",
          type: "llamaApi" as const,
        },
      ]

      mockPriceRepository.getPriceSources.mockResolvedValue(llamaOnlyPriceSources)
      vi.mocked(chainView).mockResolvedValue([
        { ervc4626shares: [] as any, sUsgPrice: BigInt("2000000000000000000"), usgPrice: BigInt("1500000000000000000"), debtIndexes: [] },
      ])

      const result = await pricePointService.fetchPriceFeed()

      expect(mockPriceApiService.getLlamaPrice).toHaveBeenCalledWith(["0x1000000000000000000000000000000000000001"])
      expect(mockPriceApiService.fetchCurveApiPrices).not.toHaveBeenCalled()
      expect(mockPriceApiService.fetchPendleApiPrices).not.toHaveBeenCalled()

      expect(result).toHaveLength(3) // Llama + USG + sUSG
      expect(result).toEqual([
        { address: "0x1000000000000000000000000000000000000001", price: 1.0 },
        { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.5 },
        { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 2.0 },
      ])
    })

    it("should handle very large BigInt values from chainView", async () => {
      const largeBigIntChainViewPrices = {
        ervc4626shares: [] as any,
        sUsgPrice: BigInt("999999999999999999999999999999"), // Very large value
        usgPrice: BigInt("1000000000000000000000000000000"), // Very large value
        debtIndexes: [],
      }

      mockPriceRepository.getPriceSources.mockResolvedValue([])
      vi.mocked(chainView).mockResolvedValue([largeBigIntChainViewPrices])

      const result = await pricePointService.fetchPriceFeed()

      expect(result).toHaveLength(2)
      // These should be very large numbers - verify they're at least as big as expected
      expect(result[0].price).toBeGreaterThanOrEqual(1000000000000) // USG
      expect(result[1].price).toBeGreaterThanOrEqual(999999999999) // sUSG
      expect(isFinite(result[0].price)).toBe(true)
      expect(isFinite(result[1].price)).toBe(true)
    })

    it("should handle zero BigInt values from chainView", async () => {
      const zeroBigIntChainViewPrices = {
        ervc4626shares: [] as any,
        sUsgPrice: BigInt(0),
        usgPrice: BigInt(0),
        debtIndexes: [],
      }

      mockPriceRepository.getPriceSources.mockResolvedValue([])
      vi.mocked(chainView).mockResolvedValue([zeroBigIntChainViewPrices])

      const result = await pricePointService.fetchPriceFeed()

      expect(result).toHaveLength(2)
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

    it("should handle empty ervc4626shares array", () => {
      const emptyChainViewPrices = {
        ervc4626shares: [] as any,
        sUsgPrice: BigInt("1100000000000000000"),
        usgPrice: BigInt("1000000000000000000"),
        debtIndexes: [],
      }
      const apiPrices: PriceInfo[] = []

      pricePointService.processErc4626Prices(mockPriceSources, emptyChainViewPrices, apiPrices)

      // Should not add any ERC4626 prices when array is empty
      expect(apiPrices).toHaveLength(0)
    })

    it("should handle null/undefined chainViewPrices", () => {
      const nullChainViewPrices = null as any
      const apiPrices: PriceInfo[] = []

      pricePointService.processErc4626Prices(mockPriceSources, nullChainViewPrices, apiPrices)

      // Should not add any prices when chainViewPrices is null
      expect(apiPrices).toHaveLength(0)
    })

    it("should handle multiple ERC4626 tokens with same reference", () => {
      const multipleErc4626Sources = [
        {
          address: "0x4000000000000000000000000000000000000004",
          name: "ERC4626 Vault A",
          type: "ERC4626" as const,
          refToken: "0x1000000000000000000000000000000000000001", // USDC
        },
        {
          address: "0x5000000000000000000000000000000000000005",
          name: "ERC4626 Vault B",
          type: "ERC4626" as const,
          refToken: "0x1000000000000000000000000000000000000001", // Same USDC reference
        },
      ]

      const multipleErc4626ChainView = {
        ervc4626shares: [
          { token: "0x4000000000000000000000000000000000000004", shares: BigInt("1050000000000000000") }, // 1.05 shares
          { token: "0x5000000000000000000000000000000000000005", shares: BigInt("1200000000000000000") }, // 1.2 shares
        ] as any,
        sUsgPrice: BigInt("1100000000000000000"),
        usgPrice: BigInt("1000000000000000000"),
        debtIndexes: [],
      }

      const apiPrices: PriceInfo[] = [
        { address: "0x1000000000000000000000000000000000000001", price: 1.0 }, // USDC reference
      ]

      pricePointService.processErc4626Prices(multipleErc4626Sources, multipleErc4626ChainView, apiPrices)

      expect(apiPrices).toContainEqual({
        address: "0x4000000000000000000000000000000000000004",
        price: 1.05, // 1.05 shares * 1.0 USD
      })
      expect(apiPrices).toContainEqual({
        address: "0x5000000000000000000000000000000000000005",
        price: 1.2, // 1.2 shares * 1.0 USD
      })
    })

    it("should handle very large share values", () => {
      const largeSharesChainView = {
        ervc4626shares: [
          { token: "0x4000000000000000000000000000000000000004", shares: BigInt("999999999999999999999999999999") }, // Very large shares
        ] as any,
        sUsgPrice: BigInt("1100000000000000000"),
        usgPrice: BigInt("1000000000000000000"),
        debtIndexes: [],
      }

      const apiPrices: PriceInfo[] = [
        { address: "0x1000000000000000000000000000000000000001", price: 1.0 }, // USDC reference
      ]

      pricePointService.processErc4626Prices(mockPriceSources, largeSharesChainView, apiPrices)

      expect(apiPrices).toContainEqual({
        address: "0x4000000000000000000000000000000000000004",
        price: expect.any(Number), // Should not throw, result should be a number
      })
      // Verify it's a very large number but finite
      const addedPrice = apiPrices.find((p) => p.address === "0x4000000000000000000000000000000000000004")
      expect(addedPrice?.price).toBeGreaterThanOrEqual(1000000000000) // Use >= instead of >
      expect(isFinite(addedPrice?.price || 0)).toBe(true)
    })

    it("should handle zero share values", () => {
      const zeroSharesChainView = {
        ervc4626shares: [
          { token: "0x4000000000000000000000000000000000000004", shares: BigInt(0) }, // Zero shares
        ] as any,
        sUsgPrice: BigInt("1100000000000000000"),
        usgPrice: BigInt("1000000000000000000"),
        debtIndexes: [],
      }

      const apiPrices: PriceInfo[] = [
        { address: "0x1000000000000000000000000000000000000001", price: 1.0 }, // USDC reference
      ]

      pricePointService.processErc4626Prices(mockPriceSources, zeroSharesChainView, apiPrices)

      expect(apiPrices).toContainEqual({
        address: "0x4000000000000000000000000000000000000004",
        price: 0, // 0 shares * 1.0 USD = 0
      })
    })

    it("should handle fractional reference prices", () => {
      const apiPrices: PriceInfo[] = [
        { address: "0x1000000000000000000000000000000000000001", price: 0.123456789 }, // Fractional USDC price
      ]

      pricePointService.processErc4626Prices(mockPriceSources, mockChainViewPrices, apiPrices)

      expect(apiPrices).toContainEqual({
        address: "0x4000000000000000000000000000000000000004",
        price: expect.any(Number), // Should handle fractional calculations
      })
      // Verify the calculation precision
      const addedPrice = apiPrices.find((p) => p.address === "0x4000000000000000000000000000000000000004")
      expect(addedPrice?.price).toBeCloseTo(0.129629629, 6) // 1.05 * 0.123456789
    })
  })

  describe("chainViewPrices", () => {
    it("should call chainView with correct parameters", async () => {
      const erc4626Addresses = ["0x4000000000000000000000000000000000000004"]
      const markets = ["0x9000000000000000000000000000000000000001", "0x9000000000000000000000000000000000000002"]
      vi.mocked(chainView).mockResolvedValue([mockChainViewPrices])

      const result = await pricePointService.chainViewPrices(erc4626Addresses, markets)

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
          markets,
        ]
      )

      expect(result).toEqual(mockChainViewPrices)
    })

    it("should handle chainView errors", async () => {
      const erc4626Addresses = ["0x4000000000000000000000000000000000000004"]
      const markets = ["0x9000000000000000000000000000000000000001"]
      vi.mocked(chainView).mockRejectedValue(new Error("Chain view error"))

      await expect(pricePointService.chainViewPrices(erc4626Addresses, markets)).rejects.toThrow("Chain view error")
    })

    it("should handle empty ERC4626 addresses array", async () => {
      const emptyAddresses: string[] = []
      const markets = ["0x9000000000000000000000000000000000000001"]
      vi.mocked(chainView).mockResolvedValue([mockChainViewPrices])

      const result = await pricePointService.chainViewPrices(emptyAddresses, markets)

      expect(chainView).toHaveBeenCalledWith(mockProvider, expect.any(Array), expect.any(String), [
        [], // Empty array
        expect.any(Object),
        markets,
      ])
      expect(result).toEqual(mockChainViewPrices)
    })

    it("should handle malformed chainView response", async () => {
      const erc4626Addresses = ["0x4000000000000000000000000000000000000004"]
      const markets = ["0x9000000000000000000000000000000000000001"]
      // Mock chainView returning undefined/malformed response
      vi.mocked(chainView).mockResolvedValue(undefined as any)

      const result = await pricePointService.chainViewPrices(erc4626Addresses, markets)

      expect(result).toBeUndefined()
    })

    it("should handle chainView returning empty array", async () => {
      const erc4626Addresses = ["0x4000000000000000000000000000000000000004"]
      const markets = ["0x9000000000000000000000000000000000000001"]
      vi.mocked(chainView).mockResolvedValue([])

      const result = await pricePointService.chainViewPrices(erc4626Addresses, markets)

      expect(result).toBeUndefined()
    })

    it("should handle very large ERC4626 addresses array", async () => {
      // Create array with many addresses
      const manyAddresses = Array.from({ length: 100 }, (_, i) => `0x${i.toString().padStart(40, "0")}`)
      const markets = ["0x9000000000000000000000000000000000000001"]
      vi.mocked(chainView).mockResolvedValue([mockChainViewPrices])

      const result = await pricePointService.chainViewPrices(manyAddresses, markets)

      expect(chainView).toHaveBeenCalledWith(mockProvider, expect.any(Array), expect.any(String), [manyAddresses, expect.any(Object), markets])
      expect(result).toEqual(mockChainViewPrices)
    })

    it("should handle network timeout errors", async () => {
      const erc4626Addresses = ["0x4000000000000000000000000000000000000004"]
      const markets = ["0x9000000000000000000000000000000000000001"]
      vi.mocked(chainView).mockRejectedValue(new Error("ETIMEDOUT: Network timeout"))

      await expect(pricePointService.chainViewPrices(erc4626Addresses, markets)).rejects.toThrow("ETIMEDOUT: Network timeout")
    })
  })

  describe("insertPrices", () => {
    it("should call priceRepository.insertPriceFeed", async () => {
      const prices: PriceInfo[] = [{ address: "0x1000000000000000000000000000000000000001", price: 1.0 }]

      const result = await pricePointService.insertPrices(prices)

      expect(mockPriceRepository.insertPriceFeed).toHaveBeenCalledWith(prices)
      expect(result).toEqual([])
    })

    it("should handle empty prices array", async () => {
      const emptyPrices: PriceInfo[] = []

      const result = await pricePointService.insertPrices(emptyPrices)

      expect(mockPriceRepository.insertPriceFeed).toHaveBeenCalledWith(emptyPrices)
      expect(result).toEqual([])
    })

    it("should handle large prices array", async () => {
      const largePricesArray: PriceInfo[] = Array.from({ length: 1000 }, (_, i) => ({
        address: `0x${i.toString().padStart(40, "0")}`,
        price: Math.random() * 1000,
      }))

      const result = await pricePointService.insertPrices(largePricesArray)

      expect(mockPriceRepository.insertPriceFeed).toHaveBeenCalledWith(largePricesArray)
      expect(result).toEqual([])
    })
  })

  describe("processDebtIndexes", () => {
    it("should process debt indexes correctly", () => {
      const apiPrices: PriceInfo[] = []
      const chainViewPrices = {
        ervc4626shares: [] as any,
        sUsgPrice: BigInt("1000000000000000000"),
        usgPrice: BigInt("1000000000000000000"),
        debtIndexes: [
          { market: "0x9000000000000000000000000000000000000001", index: BigInt("1200000000000000000") }, // 1.2 index
          { market: "0x9000000000000000000000000000000000000002", index: BigInt("1150000000000000000") }, // 1.15 index
        ],
      }

      pricePointService.processDebtIndexes(chainViewPrices, apiPrices)

      expect(apiPrices).toHaveLength(2)
      expect(apiPrices).toEqual([
        { address: "0x9000000000000000000000000000000000000001", price: 1.2 },
        { address: "0x9000000000000000000000000000000000000002", price: 1.15 },
      ])
    })

    it("should handle empty debt indexes array", () => {
      const apiPrices: PriceInfo[] = []
      const chainViewPrices = {
        ervc4626shares: [] as any,
        sUsgPrice: BigInt("1000000000000000000"),
        usgPrice: BigInt("1000000000000000000"),
        debtIndexes: [],
      }

      pricePointService.processDebtIndexes(chainViewPrices, apiPrices)

      expect(apiPrices).toHaveLength(0)
    })

    it("should handle very large debt index values", () => {
      const apiPrices: PriceInfo[] = []
      const chainViewPrices = {
        ervc4626shares: [] as any,
        sUsgPrice: BigInt("1000000000000000000"),
        usgPrice: BigInt("1000000000000000000"),
        debtIndexes: [
          { market: "0x9000000000000000000000000000000000000001", index: BigInt("999999999999999999999999999999") }, // Very large index
        ],
      }

      pricePointService.processDebtIndexes(chainViewPrices, apiPrices)

      expect(apiPrices).toHaveLength(1)
      expect(apiPrices[0].address).toBe("0x9000000000000000000000000000000000000001")
      expect(apiPrices[0].price).toBeGreaterThanOrEqual(1000000000000) // Very large number
      expect(isFinite(apiPrices[0].price)).toBe(true)
    })

    it("should handle zero debt index values", () => {
      const apiPrices: PriceInfo[] = []
      const chainViewPrices = {
        ervc4626shares: [] as any,
        sUsgPrice: BigInt("1000000000000000000"),
        usgPrice: BigInt("1000000000000000000"),
        debtIndexes: [
          { market: "0x9000000000000000000000000000000000000001", index: BigInt("0") }, // Zero index
        ],
      }

      pricePointService.processDebtIndexes(chainViewPrices, apiPrices)

      expect(apiPrices).toHaveLength(1)
      expect(apiPrices).toEqual([{ address: "0x9000000000000000000000000000000000000001", price: 0 }])
    })

    it("should handle multiple debt indexes for different markets", () => {
      const apiPrices: PriceInfo[] = []
      const chainViewPrices = {
        ervc4626shares: [] as any,
        sUsgPrice: BigInt("1000000000000000000"),
        usgPrice: BigInt("1000000000000000000"),
        debtIndexes: [
          { market: "0x9000000000000000000000000000000000000001", index: BigInt("1200000000000000000") }, // 1.2 index
          { market: "0x9000000000000000000000000000000000000002", index: BigInt("1150000000000000000") }, // 1.15 index
          { market: "0x9000000000000000000000000000000000000003", index: BigInt("1000000000000000000") }, // 1.0 index
          { market: "0x9000000000000000000000000000000000000004", index: BigInt("950000000000000000") }, // 0.95 index
        ],
      }

      pricePointService.processDebtIndexes(chainViewPrices, apiPrices)

      expect(apiPrices).toHaveLength(4)
      expect(apiPrices).toEqual([
        { address: "0x9000000000000000000000000000000000000001", price: 1.2 },
        { address: "0x9000000000000000000000000000000000000002", price: 1.15 },
        { address: "0x9000000000000000000000000000000000000003", price: 1.0 },
        { address: "0x9000000000000000000000000000000000000004", price: 0.95 },
      ])
    })

    it("should handle null/undefined chainViewPrices", () => {
      const apiPrices: PriceInfo[] = []
      const nullChainViewPrices = null as any

      pricePointService.processDebtIndexes(nullChainViewPrices, apiPrices)

      expect(apiPrices).toHaveLength(0)
    })

    it("should append to existing apiPrices array", () => {
      const apiPrices: PriceInfo[] = [{ address: "0x1000000000000000000000000000000000000001", price: 1.0 }]
      const chainViewPrices = {
        ervc4626shares: [] as any,
        sUsgPrice: BigInt("1000000000000000000"),
        usgPrice: BigInt("1000000000000000000"),
        debtIndexes: [
          { market: "0x9000000000000000000000000000000000000001", index: BigInt("1200000000000000000") }, // 1.2 index
        ],
      }

      pricePointService.processDebtIndexes(chainViewPrices, apiPrices)

      expect(apiPrices).toHaveLength(2)
      expect(apiPrices).toEqual([
        { address: "0x1000000000000000000000000000000000000001", price: 1.0 }, // Existing price
        { address: "0x9000000000000000000000000000000000000001", price: 1.2 }, // New debt index
      ])
    })
  })

  describe("Markets Integration", () => {
    it("should handle empty markets array", async () => {
      mockMarketContractsRepository.getContracts.mockResolvedValue([])
      vi.mocked(chainView).mockResolvedValue([{ ervc4626shares: [], sUsgPrice: BigInt(0), usgPrice: BigInt(0), debtIndexes: [] }])

      const result = await pricePointService.fetchPriceFeed()

      expect(mockMarketContractsRepository.getContracts).toHaveBeenCalledOnce()
      // chainView should be called with empty markets array
      expect(chainView).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), [
        ["0x4000000000000000000000000000000000000004"],
        expect.anything(),
        [],
      ])
      expect(result).toHaveLength(5) // All price sources when no markets: llamaApi, curveApi, pendleApi, USG, sUSG
    })

    it("should handle null markets from repository", async () => {
      mockMarketContractsRepository.getContracts.mockResolvedValue(null)
      vi.mocked(chainView).mockResolvedValue([{ ervc4626shares: [], sUsgPrice: BigInt(0), usgPrice: BigInt(0), debtIndexes: [] }])

      const result = await pricePointService.fetchPriceFeed()

      expect(mockMarketContractsRepository.getContracts).toHaveBeenCalledOnce()
      // chainView should be called with empty markets array when null
      expect(chainView).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), [
        ["0x4000000000000000000000000000000000000004"],
        expect.anything(),
        [],
      ])
      expect(result).toHaveLength(5) // All price sources when no markets: llamaApi, curveApi, pendleApi, USG, sUSG
    })

    it("should handle markets repository error", async () => {
      mockMarketContractsRepository.getContracts.mockRejectedValue(new Error("Database error"))

      await expect(pricePointService.fetchPriceFeed()).rejects.toThrow("Database error")
    })

    it("should fetch and process markets correctly", async () => {
      const mockMarketsData = [
        { contract_address: "0xMarket1", name: "Market 1" },
        { contract_address: "0xMarket2", name: "Market 2" },
        { contract_address: "0xMarket3", name: "Market 3" },
      ]
      mockMarketContractsRepository.getContracts.mockResolvedValue(mockMarketsData)

      const chainViewWithMultipleMarkets = {
        ervc4626shares: [],
        sUsgPrice: BigInt("1000000000000000000"),
        usgPrice: BigInt("1000000000000000000"),
        debtIndexes: [
          { market: "0xmarket1", index: BigInt("1100000000000000000") }, // 1.1 index (lowercase)
          { market: "0xmarket2", index: BigInt("1200000000000000000") }, // 1.2 index
          { market: "0xmarket3", index: BigInt("1050000000000000000") }, // 1.05 index
        ],
      }
      vi.mocked(chainView).mockResolvedValue([chainViewWithMultipleMarkets])

      const result = await pricePointService.fetchPriceFeed()

      expect(mockMarketContractsRepository.getContracts).toHaveBeenCalledOnce()
      expect(chainView).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        [["0x4000000000000000000000000000000000000004"], expect.anything(), ["0xmarket1", "0xmarket2", "0xmarket3"]] // lowercase addresses
      )

      // Should include debt indexes for all markets
      expect(result).toEqual(
        expect.arrayContaining([
          { address: "0xmarket1", price: 1.1 },
          { address: "0xmarket2", price: 1.2 },
          { address: "0xmarket3", price: 1.05 },
          { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.0 }, // USG
          { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.0 }, // sUSG
        ])
      )
    })

    it("should handle case sensitivity in market addresses", async () => {
      const mockMarketsData = [{ contract_address: "0xABCDEF1234567890123456789012345678901234", name: "Mixed Case Market" }]
      mockMarketContractsRepository.getContracts.mockResolvedValue(mockMarketsData)

      const chainViewResponse = {
        ervc4626shares: [],
        sUsgPrice: BigInt("1000000000000000000"),
        usgPrice: BigInt("1000000000000000000"),
        debtIndexes: [
          { market: "0xabcdef1234567890123456789012345678901234", index: BigInt("1100000000000000000") }, // lowercase response
        ],
      }
      vi.mocked(chainView).mockResolvedValue([chainViewResponse])

      const result = await pricePointService.fetchPriceFeed()

      // Verify that addresses are converted to lowercase for chainView call
      expect(chainView).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), [
        ["0x4000000000000000000000000000000000000004"],
        expect.anything(),
        ["0xabcdef1234567890123456789012345678901234"],
      ])

      // Should include debt index with the address as returned from chainView
      expect(result).toEqual(expect.arrayContaining([{ address: "0xabcdef1234567890123456789012345678901234", price: 1.1 }]))
    })
  })

  describe("Integration Scenarios", () => {
    it("should handle realistic DeFi price scenario", async () => {
      const realisticPriceSources = [
        { address: "0xA0b86a33E6441B8bBf67bC7bb8B1f70A3F5F9F11", name: "USDC", type: "llamaApi" as const },
        { address: "0x4faBb145d64652a948d72533023f6E7A623C7C53", name: "Curve-USG-USDC", type: "curveApi" as const },
        { address: "0x808507121B80c02388fAd14726482e061B8da827", name: "Pendle-PT-USDC", type: "pendleApi" as const },
        {
          address: "0x1234567890123456789012345678901234567890",
          name: "Yearn-USDC-Vault",
          type: "ERC4626" as const,
          refToken: "0xA0b86a33E6441B8bBf67bC7bb8B1f70A3F5F9F11",
        },
      ]

      const realisticChainViewPrices = {
        ervc4626shares: [
          { token: "0x1234567890123456789012345678901234567890", shares: BigInt("1065000000000000000") }, // 6.5% yield
        ] as any,
        sUsgPrice: BigInt("1002000000000000000"), // $1.002
        usgPrice: BigInt("999500000000000000"), // $0.9995 (slight depeg)
        debtIndexes: [
          { market: "0x9000000000000000000000000000000000000001", index: BigInt("1050000000000000000") }, // 5% debt growth
          { market: "0x9000000000000000000000000000000000000002", index: BigInt("1030000000000000000") }, // 3% debt growth
        ],
      }

      mockPriceRepository.getPriceSources.mockResolvedValue(realisticPriceSources)
      mockPriceApiService.getLlamaPrice.mockResolvedValue([{ address: "0xA0b86a33E6441B8bBf67bC7bb8B1f70A3F5F9F11", price: 0.9998 }])
      mockPriceApiService.fetchCurveApiPrices.mockResolvedValue([{ address: "0x4faBb145d64652a948d72533023f6E7A623C7C53", price: 1.0001 }])
      mockPriceApiService.fetchPendleApiPrices.mockResolvedValue([{ address: "0x808507121B80c02388fAd14726482e061B8da827", price: 0.9985 }])
      vi.mocked(chainView).mockResolvedValue([realisticChainViewPrices])

      const result = await pricePointService.fetchPriceFeed()

      expect(result).toHaveLength(8) // All price sources + USG/sUSG + 2 debt indexes
      expect(result).toEqual(
        expect.arrayContaining([
          { address: "0xA0b86a33E6441B8bBf67bC7bb8B1f70A3F5F9F11", price: 0.9998 }, // USDC
          { address: "0x4faBb145d64652a948d72533023f6E7A623C7C53", price: 1.0001 }, // Curve pool
          { address: "0x808507121B80c02388fAd14726482e061B8da827", price: 0.9985 }, // Pendle PT
          { address: "0x1234567890123456789012345678901234567890", price: expect.closeTo(1.0648, 4) }, // Yearn vault (1.065 * 0.9998)
          { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 0.9995 }, // USG
          { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.002 }, // sUSG
          { address: "0x9000000000000000000000000000000000000001", price: 1.05 }, // Market 1 debt index
          { address: "0x9000000000000000000000000000000000000002", price: 1.03 }, // Market 2 debt index
        ])
      )
    })

    it("should handle market stress scenario", async () => {
      const stressPriceSources = [
        { address: "0xA0b86a33E6441B8bBf67bC7bb8B1f70A3F5F9F11", name: "USDC", type: "llamaApi" as const },
        {
          address: "0x1234567890123456789012345678901234567890",
          name: "Stressed-Vault",
          type: "ERC4626" as const,
          refToken: "0xA0b86a33E6441B8bBf67bC7bb8B1f70A3F5F9F11",
        },
      ]

      const stressChainViewPrices = {
        ervc4626shares: [
          { token: "0x1234567890123456789012345678901234567890", shares: BigInt("800000000000000000") }, // 20% loss
        ] as any,
        sUsgPrice: BigInt("900000000000000000"), // 10% depeg
        usgPrice: BigInt("950000000000000000"), // 5% depeg
        debtIndexes: [
          { market: "0x9000000000000000000000000000000000000001", index: BigInt("1500000000000000000") }, // 50% debt spike
          { market: "0x9000000000000000000000000000000000000002", index: BigInt("1200000000000000000") }, // 20% debt spike
        ],
      }

      mockPriceRepository.getPriceSources.mockResolvedValue(stressPriceSources)
      mockPriceApiService.getLlamaPrice.mockResolvedValue([{ address: "0xA0b86a33E6441B8bBf67bC7bb8B1f70A3F5F9F11", price: 1.0 }])
      vi.mocked(chainView).mockResolvedValue([stressChainViewPrices])

      const result = await pricePointService.fetchPriceFeed()

      expect(result).toHaveLength(6) // USDC + Vault + USG + sUSG + 2 debt indexes
      expect(result).toEqual(
        expect.arrayContaining([
          { address: "0xA0b86a33E6441B8bBf67bC7bb8B1f70A3F5F9F11", price: 1.0 }, // USDC stable
          { address: "0x1234567890123456789012345678901234567890", price: 0.8 }, // Vault down 20%
          { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 0.95 }, // USG depegged
          { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 0.9 }, // sUSG more depegged
          { address: "0x9000000000000000000000000000000000000001", price: 1.5 }, // Market 1 debt spike
          { address: "0x9000000000000000000000000000000000000002", price: 1.2 }, // Market 2 debt spike
        ])
      )
    })

    it("should handle mixed success/failure scenario", async () => {
      const mixedPriceSources = [
        { address: "0xA0b86a33E6441B8bBf67bC7bb8B1f70A3F5F9F11", name: "USDC", type: "llamaApi" as const },
        { address: "0x4faBb145d64652a948d72533023f6E7A623C7C53", name: "Curve-Pool", type: "curveApi" as const },
        { address: "0x808507121B80c02388fAd14726482e061B8da827", name: "Pendle-Token", type: "pendleApi" as const },
      ]

      // Llama succeeds, Curve fails, Pendle succeeds
      mockPriceRepository.getPriceSources.mockResolvedValue(mixedPriceSources)
      mockPriceApiService.getLlamaPrice.mockResolvedValue([{ address: "0xA0b86a33E6441B8bBf67bC7bb8B1f70A3F5F9F11", price: 1.0 }])
      mockPriceApiService.fetchCurveApiPrices.mockImplementation(() => {
        throw new Error("Curve API maintenance")
      })
      mockPriceApiService.fetchPendleApiPrices.mockResolvedValue([{ address: "0x808507121B80c02388fAd14726482e061B8da827", price: 1.05 }])
      vi.mocked(chainView).mockResolvedValue([
        {
          ervc4626shares: [] as any,
          sUsgPrice: BigInt("1000000000000000000"),
          usgPrice: BigInt("1000000000000000000"),
          debtIndexes: [],
        },
      ])

      const result = await pricePointService.fetchPriceFeed()

      expect(result).toHaveLength(4) // Llama + Pendle + USG + sUSG (no Curve)
      expect(result).toEqual(
        expect.arrayContaining([
          { address: "0xA0b86a33E6441B8bBf67bC7bb8B1f70A3F5F9F11", price: 1.0 }, // Llama succeeded
          { address: "0x808507121B80c02388fAd14726482e061B8da827", price: 1.05 }, // Pendle succeeded
          { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.0 }, // USG
          { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: 1.0 }, // sUSG
        ])
      )
      expect(result).not.toEqual(
        expect.arrayContaining([
          { address: "0x4faBb145d64652a948d72533023f6E7A623C7C53", price: expect.any(Number) }, // Curve failed
        ])
      )
    })
  })
})
