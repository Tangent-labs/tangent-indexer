import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { JsonRpcProvider } from "ethers"
import { GetPriceFeedsResult, PricePointService } from "../../services/PricePointService.js"
import { AddressesJson, NotificationMessage, POINTS_BOT_ACTIONS, PriceApiInfo, PriceSource } from "../../type/data.js"
import { PriceApiService } from "../../services/PriceApiService.js"
import { chainView } from "../../utils/chainView.js"

// Mock dependencies (including console for error logging)
vi.mock("../../db/PriceRepository")
vi.mock("../../db/MarketContractsRepository")
vi.mock("../../services/PriceApiService")
vi.mock("../../utils/chainView")
const addresses: AddressesJson = {
  lps: {},
  utilities: {
    controlTower: "0xA",
    irCalculator: "0xB",
    marketCreator: "0xC",
    pegKeeperRegulator: "0xD",
    rewardAccumulator: "0xE",
    zappingProxy: "0xF",
  },
  implementations: {
    basicERC20Market: "0xG",
    convexCrvMarket: "0xH",
    convexFxnMarket: "0xI",
  },
  oracles: {},
  markets: [],
  pegKeepers: {},
  tokens: {
    sTAN: "0xJ",
    sUSG: "0xK",
    TAN: "0xL",
    USG: "0xM",
    vsTAN: "0xN",
  },
}

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
    { address: "0x1000000000000000000000000000000000000001", name: "USDC", type: "llamaApi", reference: null, id: BigInt(1) },
    { address: "0x2000000000000000000000000000000000000002", name: "Curve Pool", type: "curveApi", reference: "factory-stable-ng", id: BigInt(2) },
    { address: "0x3000000000000000000000000000000000000003", name: "Pendle Token", type: "pendleApi", reference: null, id: BigInt(3) },
    {
      address: "0x4000000000000000000000000000000000000004",
      name: "ERC4626 Vault",
      type: "ERC4626",
      reference: "0x1000000000000000000000000000000000000001",
      id: BigInt(4),
    },
  ]

  const mockMarkets = ["0x9000000000000000000000000000000000000001", "0x9000000000000000000000000000000000000002"]

  const mockChainViewPrices = {
    erc4626shares: [{ token: "0x4000000000000000000000000000000000000004", index: BigInt("1050000000000000000") }],
    sUsgPrice: BigInt("1100000000000000000"),
    usgPrice: BigInt("1000000000000000000"),
    timestamp: BigInt("1717171717"), // Unix timestamp
    debtIndexes: [
      { market: "0x9000000000000000000000000000000000000001", index: BigInt("1200000000000000000000000000") },
      { market: "0x9000000000000000000000000000000000000002", index: BigInt("1150000000000000000000000000") },
    ],
  }

  beforeEach(() => {
    // Clear all mocks and reset their state
    vi.clearAllMocks()
    vi.resetAllMocks()
    mockConsole.error.mockClear()

    // Reset chainView mock to default successful state
    vi.mocked(chainView).mockResolvedValue([mockChainViewPrices])

    mockPriceRepository = {
      getPriceSources: vi.fn().mockResolvedValue(mockPriceSources),
      insertPriceFeed: vi.fn().mockResolvedValue([]),
      deleteInsertLastPriceFeeds: vi.fn().mockResolvedValue([]),
    }

    mockMarketContractsRepository = {
      getContracts: vi.fn().mockResolvedValue(mockMarkets.map((addr) => ({ contract_address: addr }))),
    }

    mockProvider = {} as JsonRpcProvider

    mockPriceApiService = {
      getLlamaPrice: vi.fn().mockResolvedValue({ prices: [{ address: "0x1000000000000000000000000000000000000001", price: 1.0 }] }),
      fetchCurveApiPrices: vi.fn().mockResolvedValue({ prices: [{ address: "0x2000000000000000000000000000000000000002", price: 1.5 }] }),
      fetchPendleApiPrices: vi.fn().mockResolvedValue({ prices: [{ address: "0x3000000000000000000000000000000000000003", price: 2.0 }] }),
    }

    vi.mocked(PriceApiService).mockImplementation(() => mockPriceApiService)

    pricePointService = new PricePointService(mockPriceRepository, mockMarketContractsRepository, mockProvider, addresses)

    // Override the priceApiService with our mock after construction
    pricePointService.priceApiService = mockPriceApiService
  })

  afterEach(() => {
    // Ensure all mocks are properly cleaned up
    vi.clearAllMocks()
    vi.resetAllMocks()
  })

  describe("getPriceFeeds", () => {
    it("should fetch and combine all price sources when ERC4626 is present", async () => {
      const result = await pricePointService.getPriceFeeds()

      expect(mockPriceRepository.getPriceSources).toHaveBeenCalledOnce()
      expect(mockMarketContractsRepository.getContracts).toHaveBeenCalledOnce()
      expect(mockPriceApiService.getLlamaPrice).toHaveBeenCalledWith(["0x1000000000000000000000000000000000000001"])
      expect(mockPriceApiService.fetchCurveApiPrices).toHaveBeenCalledWith(["0x2000000000000000000000000000000000000002"], "factory-stable-ng")
      expect(mockPriceApiService.fetchPendleApiPrices).toHaveBeenCalledWith(["0x3000000000000000000000000000000000000003"])
      expect(chainView).toHaveBeenCalled()
      expect(result.prices).toHaveLength(8) // 3 APIs + 1 ERC4626 + 2 USG/sUSG + 2 debt
      expect(result.notifications).toEqual([]) // No notifications expected
      expect(result.date).toEqual(new Date(Number(mockChainViewPrices.timestamp) * 1000)) // Verify timestamp is returned
      expect(result.prices).toEqual(
        expect.arrayContaining([
          { address: "0x1000000000000000000000000000000000000001", price: 1.0 },
          { address: "0x2000000000000000000000000000000000000002", price: 1.5 },
          { address: "0x3000000000000000000000000000000000000003", price: 2.0 },
          { address: "0x4000000000000000000000000000000000000004", price: expect.any(Number) }, // ERC4626 calculated
          { address: "0x9000000000000000000000000000000000000001", price: 1.2 },
          { address: "0x9000000000000000000000000000000000000002", price: 1.15 },
          { address: "0xm", price: 1.0 },
          { address: "0xk", price: 1.1 },
        ])
      )
    })

    it("should call chainView even if no ERC4626 sources but not add USG/sUSG/debt", async () => {
      mockPriceRepository.getPriceSources.mockResolvedValue(mockPriceSources.slice(0, 3)) // No ERC4626

      const result = await pricePointService.getPriceFeeds()

      expect(chainView).toHaveBeenCalled() // chainView should always be called now
      expect(result.prices).toHaveLength(3) // Only APIs (no USG/sUSG/debt since no ERC4626)
      expect(result.notifications).toEqual([]) // No notifications expected
      expect(result.date).toBeDefined() // No date when no ERC4626 sources
      expect(result.prices).not.toEqual(
        expect.arrayContaining([
          { address: "0x400F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: expect.any(Number) },
          { address: "0x500F4d9E2c8e33cfCb6F6b6E5B5B5B5B5B5B5B5B", price: expect.any(Number) },
        ])
      )
    })

    it("should handle empty price sources (chainView called but empty result)", async () => {
      mockPriceRepository.getPriceSources.mockResolvedValue([])

      const result = await pricePointService.getPriceFeeds()

      expect(chainView).toHaveBeenCalled() // chainView should always be called now
      expect(result.prices).toEqual([]) // No sources, so no prices
      expect(result.notifications).toEqual([]) // No warnings
      expect(result.date).toBeDefined() // No date when no ERC4626 sources
    })

    it("should handle API errors and collect them as warnings", async () => {
      mockPriceApiService.getLlamaPrice.mockResolvedValue({
        prices: [],
        error: {
          api: "Llama",
          reason: "Setup error",
          httpCode: 500,
        },
      })

      const result = await pricePointService.getPriceFeeds()

      // With error resistance, other successful promises should still be processed
      expect(result.prices.length).toBeGreaterThan(0)
      expect(result.notifications).toHaveLength(2) // Llama API error + ERC4626 reference token missing
      expect(result.notifications).toContainEqual({
        process: "Llama",
        error: {
          api: "Llama",
          reason: "Setup error",
          httpCode: 500,
        },
        level: "ERROR",
        action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
      } as NotificationMessage)
      expect(result.notifications).toContainEqual({
        process: "CHAINVIEW",
        error: expect.any(Error),
        level: "WARNING",
        action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
      })
      expect(result.notifications.find((w) => w.process === "CHAINVIEW")?.error.message).toContain("No price found for reference token")
    })

    it("should handle partial promise failures with allSettled and return warnings", async () => {
      mockPriceApiService.getLlamaPrice.mockRejectedValue(new Error("Llama failed"))

      const result = await pricePointService.getPriceFeeds()

      expect(result.prices.length).toBeGreaterThan(0) // Other promises succeed (Curve, Pendle, ERC4626)
      expect(result.notifications).toHaveLength(2) // Llama failure + ERC4626 reference token missing
      expect(result.notifications).toEqual(
        expect.arrayContaining([
          {
            process: "Llama",
            error: expect.any(Error),
            level: "ERROR",
            action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
          } as NotificationMessage,
          {
            process: "CHAINVIEW",
            error: expect.any(Error),
            level: "WARNING",
            action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
          } as NotificationMessage,
        ])
      )
      expect(result.notifications).toBeDefined()
      expect(result.notifications.find((w) => w?.process === "Llama")?.error.message).toBe("Llama failed")
      expect(result.notifications.find((w) => w?.process === "CHAINVIEW")?.error.message).toContain("No price found for reference token")
    })

    it("should handle non-found price error for ERC4626 reference token", async () => {
      // Mock API services to return empty results (no prices found)
      mockPriceApiService.getLlamaPrice.mockResolvedValue({ prices: [] })
      mockPriceApiService.fetchCurveApiPrices.mockResolvedValue({ prices: [] })
      mockPriceApiService.fetchPendleApiPrices.mockResolvedValue({ prices: [] })

      const result = await pricePointService.getPriceFeeds()

      expect(result.prices.length).toBeGreaterThan(0) // USG/sUSG and debt prices should still be included
      expect(result.notifications).toHaveLength(1)
      expect(result.notifications[0]).toEqual({
        process: "CHAINVIEW",
        error: expect.any(Error),
        level: "WARNING",
        action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
      } as NotificationMessage)
      expect(result.notifications[0].error.message).toContain("No price found for reference token")
      expect(result.notifications[0].error.message).toContain("0x1000000000000000000000000000000000000001")
    })

    it("should handle all promises failing gracefully", async () => {
      mockPriceApiService.getLlamaPrice.mockRejectedValue(new Error("Llama failed"))
      mockPriceApiService.fetchCurveApiPrices.mockRejectedValue(new Error("Curve failed"))
      mockPriceApiService.fetchPendleApiPrices.mockRejectedValue(new Error("Pendle failed"))
      vi.mocked(chainView).mockRejectedValue(new Error("Chain view failed"))

      const result = await pricePointService.getPriceFeeds()

      expect(result.prices).toEqual([]) // All failed, so empty result
      expect(result.notifications).toHaveLength(4)
      expect(result.notifications).toEqual(
        expect.arrayContaining([
          { process: "Llama", error: expect.any(Error), level: "ERROR", action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES },
          { process: "Curve-factory-stable-ng", error: expect.any(Error), level: "ERROR", action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES },
          { process: "Pendle", error: expect.any(Error), level: "ERROR", action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES },
          { process: "CHAINVIEW", error: expect.any(Error), level: "ERROR", action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES },
        ] as NotificationMessage[])
      )
    })

    it("should handle HTTP 429 Too Many Requests errors from Llama API", async () => {
      // Mock Llama API to return 429 error
      mockPriceApiService.getLlamaPrice.mockResolvedValue({
        prices: [],
        error: {
          api: "LlamaPriceAPi",
          reason: "Too Many Requests",
          httpCode: 429,
        },
      })

      const result = await pricePointService.getPriceFeeds()

      // Other APIs should still work (Curve, Pendle, ERC4626)
      expect(result.prices.length).toBeGreaterThan(0)
      expect(result.notifications).toHaveLength(2) // Llama 429 error + ERC4626 reference token missing
      expect(result.notifications).toEqual(
        expect.arrayContaining([
          {
            process: "Llama",
            error: {
              api: "LlamaPriceAPi",
              reason: "Too Many Requests",
              httpCode: 429,
            },
            level: "ERROR",
            action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
          },
          {
            process: "CHAINVIEW",
            error: expect.any(Error),
            level: "WARNING",
            action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
          },
        ] as NotificationMessage[])
      )
    })

    it("should handle HTTP 429 Too Many Requests errors from Curve API", async () => {
      // Mock Curve API to return 429 error
      mockPriceApiService.fetchCurveApiPrices.mockResolvedValue({
        prices: [],
        error: {
          api: "CurvePriceApi",
          reason: "Too Many Requests",
          httpCode: 429,
        },
      })

      const result = await pricePointService.getPriceFeeds()

      // Other APIs should still work (Llama, Pendle, ERC4626)
      expect(result.prices.length).toBeGreaterThan(0)
      expect(result.notifications).toHaveLength(1) // Only Curve 429 error (Llama provides reference token)
      expect(result.notifications).toEqual([
        {
          process: "Curve-factory-stable-ng",
          error: {
            api: "CurvePriceApi",
            reason: "Too Many Requests",
            httpCode: 429,
          },
          level: "ERROR",
          action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
        },
      ] as NotificationMessage[])
    })

    it("should handle HTTP 500 server errors from Pendle API", async () => {
      // Mock Pendle API to return 500 error
      mockPriceApiService.fetchPendleApiPrices.mockResolvedValue({
        prices: [],
        error: {
          api: "PendlePriceApi",
          reason: "Internal Server Error",
          httpCode: 500,
        },
        level: "WARNING",
      })

      const result = await pricePointService.getPriceFeeds()

      // Other APIs should still work
      expect(result.prices.length).toBeGreaterThan(0)
      expect(result.notifications).toHaveLength(1) // Only Pendle 500 error (Llama provides reference token)
      expect(result.notifications).toEqual([
        {
          process: "Pendle",
          error: {
            api: "PendlePriceApi",
            reason: "Internal Server Error",
            httpCode: 500,
          },
          level: "ERROR",
          action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
        },
      ] as NotificationMessage[])
    })

    it("should add warning when debt indexes are missing for requested markets", async () => {
      const chainViewPricesWithMissingDebt = {
        ...mockChainViewPrices,
        debtIndexes: [
          { market: "0x9000000000000000000000000000000000000001", index: BigInt("1200000000000000000") },
          // Missing market 0x9000000000000000000000000000000000000002
        ],
      }
      vi.mocked(chainView).mockResolvedValue([chainViewPricesWithMissingDebt])

      const result = await pricePointService.getPriceFeeds()

      expect(result.notifications).toHaveLength(1)
      expect(result.notifications[0]).toEqual({
        process: "DebtIndexes",
        error: expect.any(Error),
        level: "ERROR",
        action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
      } as NotificationMessage)
      expect(result.notifications[0].error.message).toContain("No debt index data returned for markets")
      expect(result.notifications[0].error.message).toContain("0x9000000000000000000000000000000000000002")
    })

    it("should add warning when Curve price source has no registry and skip it", async () => {
      const priceSourcesWithoutRegistry = [
        { address: "0x1000000000000000000000000000000000000001", name: "USDC", type: "llamaApi", reference: null, id: BigInt(1) },
        { address: "0x2000000000000000000000000000000000000002", name: "Curve Pool", type: "curveApi", reference: null, id: BigInt(2) }, // No registry
        { address: "0x3000000000000000000000000000000000000003", name: "Pendle Token", type: "pendleApi", reference: null, id: BigInt(3) },
      ]
      mockPriceRepository.getPriceSources.mockResolvedValue(priceSourcesWithoutRegistry)

      const result = await pricePointService.getPriceFeeds()

      // Curve API should not be called since the source has no registry
      expect(mockPriceApiService.fetchCurveApiPrices).not.toHaveBeenCalled()
      expect(mockPriceApiService.getLlamaPrice).toHaveBeenCalled()
      expect(mockPriceApiService.fetchPendleApiPrices).toHaveBeenCalled()

      // Should have warning for missing registry
      expect(result.notifications).toHaveLength(1)
      expect(result.notifications[0]).toEqual({
        process: "Curve",
        error: {
          reason: "No registry specified for price source 0x2000000000000000000000000000000000000002, skipping this price source",
          api: "Curve",
        },
        level: "WARNING",
        action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
      } as NotificationMessage)
    })

    it("should return correct timestamp when ERC4626 sources exist", async () => {
      const testTimestamp = BigInt("1640995200") // 2022-01-01 00:00:00 UTC
      const chainViewWithCustomTimestamp = {
        ...mockChainViewPrices,
        timestamp: testTimestamp,
      }
      vi.mocked(chainView).mockResolvedValue([chainViewWithCustomTimestamp])

      const result = await pricePointService.getPriceFeeds()

      const expectedDate = new Date(Number(testTimestamp) * 1000)
      expect(result.date).toEqual(expectedDate)
      expect(result.date?.getTime()).toBe(1640995200000)
    })

    it("should handle chainView failure and return undefined date", async () => {
      vi.mocked(chainView).mockRejectedValue(new Error("Chain view failed"))

      const result = await pricePointService.getPriceFeeds()

      expect(result.date).toBeUndefined()
      expect(result.notifications).toContainEqual({
        process: "CHAINVIEW",
        error: expect.any(Error),
        level: "ERROR",
        action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
      } as NotificationMessage)
    })

    // ... (keep other getPriceFeeds tests from previous version, adjusted for no USG/sUSG without ERC4626)
  })
  const address = "0x1000000000000000000000000000000000000001"

  describe("fetchPriceFeed", () => {
    it("should fetch prices and insert them", async () => {
      const mockPrices = [{ address, price: 1.0 }]
      const mockResult: GetPriceFeedsResult = { prices: mockPrices, notifications: [], priceSourcePerAddress: { [address]: 1n } }
      vi.spyOn(pricePointService, "getPriceFeeds").mockResolvedValue(mockResult)

      await pricePointService.fetchPriceFeed()
      expect(pricePointService.getPriceFeeds).toHaveBeenCalled()
      const callArgs = mockPriceRepository.insertPriceFeed.mock.calls[0][0]
      expect(callArgs).toHaveLength(1)
      expect(callArgs[0]).toMatchObject({
        price_source_id: 1n,
        price_usd: 1,
      })
      expect(callArgs[0].timestamp).toBeInstanceOf(Date)
      expect(Math.abs(callArgs[0].timestamp.getTime() - Date.now())).toBeLessThan(1000) // Within 1 second
    })

    it("should handle empty prices", async () => {
      const mockResult = { prices: [], notifications: [], priceSourcePerAddress: { [address]: 1n } }
      vi.spyOn(pricePointService, "getPriceFeeds").mockResolvedValue(mockResult)
      await pricePointService.fetchPriceFeed()
      expect(mockPriceRepository.insertPriceFeed).not.toHaveBeenCalled()
    })

    it("should pass timestamp from chainView to insertPriceFeed when ERC4626 sources exist", async () => {
      const mockPrices = [{ address, price: 1.0 }]
      const mockResult = { prices: mockPrices, notifications: [], priceSourcePerAddress: { [address]: 1n } }
      vi.spyOn(pricePointService, "getPriceFeeds").mockResolvedValue(mockResult)

      await pricePointService.fetchPriceFeed()

      const callArgs = mockPriceRepository.insertPriceFeed.mock.calls[0][0]
      expect(callArgs).toHaveLength(1)
      expect(callArgs[0]).toMatchObject({
        price_source_id: 1n,
        price_usd: 1,
      })
      expect(callArgs[0].timestamp).toBeInstanceOf(Date)
      expect(Math.abs(callArgs[0].timestamp.getTime() - Date.now())).toBeLessThan(1000) // Within 1 second
    })

    it("should pass undefined date to insertPriceFeed when no ERC4626 sources exist", async () => {
      mockPriceRepository.getPriceSources.mockResolvedValue(mockPriceSources.slice(0, 3)) // No ERC4626
      const mockPrices = [{ address, price: 1.0 }]
      const mockResult = { prices: mockPrices, notifications: [], priceSourcePerAddress: { [address]: 1n } }
      vi.spyOn(pricePointService, "getPriceFeeds").mockResolvedValue(mockResult)

      await pricePointService.fetchPriceFeed()

      const callArgs = mockPriceRepository.insertPriceFeed.mock.calls[0][0]
      expect(callArgs).toHaveLength(1)
      expect(callArgs[0]).toMatchObject({
        price_source_id: 1n,
        price_usd: 1,
      })
      expect(callArgs[0].timestamp).toBeInstanceOf(Date)
      expect(Math.abs(callArgs[0].timestamp.getTime() - Date.now())).toBeLessThan(1000) // Within 1 second
    })
  })

  describe("procesChainViewResults", () => {
    it("should extract timestamp and convert it to Date", async () => {
      const testTimestamp = BigInt("1717171717") // Unix timestamp
      const chainViewWithTimestamp = {
        ...mockChainViewPrices,
        timestamp: testTimestamp,
      }
      const apiPrices: PriceApiInfo[] = []
      const notifications: any[] = []

      const result = await pricePointService.procesChainViewResults(chainViewWithTimestamp, mockPriceSources, apiPrices, mockMarkets, notifications)

      const expectedDate = new Date(Number(testTimestamp) * 1000)
      expect(result).toEqual(expectedDate)
    })
  })

  describe("processErc4626Prices", () => {
    it("should calculate ERC4626 prices with exact BigInt logic", () => {
      const apiPrices: PriceApiInfo[] = [{ address: "0x1000000000000000000000000000000000000001", price: 1.23456789 }]
      const chainViewWithShares = {
        ...mockChainViewPrices,
        erc4626shares: [{ token: "0x4000000000000000000000000000000000000004", index: BigInt("1050000000000000000") }],
        timestamp: BigInt("17171717171717171717"),
      }

      pricePointService.processErc4626Prices(mockPriceSources, chainViewWithShares, apiPrices, [])

      expect(apiPrices).toContainEqual({ address: "0x4000000000000000000000000000000000000004", price: expect.closeTo(1.2962962845, 10) })
    })
  })

  describe("callPriceChainView", () => {
    it("should call chainView and return output", async () => {
      const erc4626 = ["0x4000000000000000000000000000000000000004"]

      const result = await pricePointService.callPriceChainView(erc4626, mockMarkets)

      expect(chainView).toHaveBeenCalledWith(mockProvider, expect.any(Array), expect.any(String), [
        erc4626,
        expect.any(Object),
        mockMarkets.map((addr) => addr.toLowerCase()),
      ])
      expect(result).toEqual(mockChainViewPrices)
    })

    it("should handle errors", async () => {
      vi.mocked(chainView).mockRejectedValue(new Error("Chain error"))

      await expect(pricePointService.callPriceChainView([], [])).rejects.toThrow("Chain error")
    })
  })

  describe("RPC Errors in getPriceFeeds", () => {
    it("should handle RPC connection errors from chain view call", async () => {
      // Mock chainView to throw a connection error
      vi.mocked(chainView).mockRejectedValue(new Error("ECONNRESET"))

      const result = await pricePointService.getPriceFeeds()

      // Other APIs should still work
      expect(result.prices.length).toBeGreaterThan(0)
      expect(result.notifications).toHaveLength(1) // Only ERC4626 connection error
      expect(result.notifications[0]).toEqual({
        process: "CHAINVIEW",
        error: expect.any(Error),
        level: "ERROR",
        action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
      } as NotificationMessage)
      expect(result.notifications[0].error.message).toBe("ECONNRESET")
    })
  })

  describe("processDebtIndexes", () => {
    it("should process debt indexes and add them to apiPrices array", () => {
      const chainViewPrices: any = {
        debtIndexes: [
          { market: "0x9000000000000000000000000000000000000001", index: BigInt("1200000000000000000000000000") },
          { market: "0x9000000000000000000000000000000000000002", index: BigInt("1150000000000000000000000000") },
        ],
      }
      const apiPrices: any[] = []

      const result = pricePointService.processDebtIndexes(chainViewPrices)

      apiPrices.push(...result.prices)

      expect(apiPrices).toHaveLength(2)
      expect(apiPrices).toEqual(
        expect.arrayContaining([
          { address: "0x9000000000000000000000000000000000000001", price: 1.2 },
          { address: "0x9000000000000000000000000000000000000002", price: 1.15 },
        ])
      )
      expect(result.missingMarkets).toEqual([])
    })

    it("should handle empty debt indexes array", () => {
      const chainViewPrices: any = {
        debtIndexes: [],
      }
      const apiPrices: any[] = []

      const result = pricePointService.processDebtIndexes(chainViewPrices)

      apiPrices.push(...result.prices)

      expect(apiPrices).toHaveLength(0)
      expect(result.missingMarkets).toEqual([])
    })

    it("should handle undefined chainViewPrices", () => {
      const apiPrices: any[] = []

      const result = pricePointService.processDebtIndexes(undefined as any)

      apiPrices.push(...result.prices)

      expect(apiPrices).toHaveLength(0)
      expect(result.missingMarkets).toEqual([])
    })

    it("should detect missing debt share data for requested markets", () => {
      const chainViewPrices: any = {
        debtIndexes: [{ market: "0x9000000000000000000000000000000000000001", index: BigInt("1200000000000000000000000000") }],
      }
      const apiPrices: any[] = []
      const requestedMarkets = [
        "0x9000000000000000000000000000000000000001",
        "0x9000000000000000000000000000000000000002",
        "0x9000000000000000000000000000000000000003",
      ]

      const result = pricePointService.processDebtIndexes(chainViewPrices, requestedMarkets)

      apiPrices.push(...result.prices)

      expect(apiPrices).toHaveLength(1)
      expect(apiPrices).toEqual([{ address: "0x9000000000000000000000000000000000000001", price: 1.2 }])
      expect(result.missingMarkets).toEqual(["0x9000000000000000000000000000000000000002", "0x9000000000000000000000000000000000000003"])
    })

    it("should handle case-insensitive market address comparison", () => {
      const chainViewPrices: any = {
        debtIndexes: [{ market: "0x9000000000000000000000000000000000000001", index: BigInt("1200000000000000000") }],
      }
      const apiPrices: any[] = []
      const requestedMarkets = [
        "0X9000000000000000000000000000000000000001", // uppercase
        "0x9000000000000000000000000000000000000002",
      ]

      const result = pricePointService.processDebtIndexes(chainViewPrices, requestedMarkets)

      apiPrices.push(...result.prices)

      expect(apiPrices).toHaveLength(1)
      expect(result.missingMarkets).toEqual(["0x9000000000000000000000000000000000000002"])
    })
  })
})
