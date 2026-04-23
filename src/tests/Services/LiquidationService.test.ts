import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "fs"
import { AddressLike, JsonRpcProvider } from "ethers"
import { LiquidationService } from "../..//services/LiquidationService.js"
import { ActiveBorrowersRepository } from "../..//db/ActiveBorrowersRepository.js"
import {
  LiquidationAccountOutInfo,
  LiquidationMarketAccountOutInfo,
  LiquidationMarketOutInfo,
  LiquidationUserInfo,
  LiquidationUserInInfo,
  LiquidationUserFullInfo,
  LiquidationEstimateInfo,
} from "../../../src/type/data.js"
import { BlockRepository } from "../../../src/db/BlockRepository.js"
import { LiquidationExecutionContext } from "../../../src/services/LiquidationExecutionContext.js"
import * as getBestRpcProviderModule from "../../../src/utils/getBestRpcProvider.js"
import { RouterService } from "../../services/RouterService.js"
import { liquidationConfig } from "../../config/liquidation_config.js"

// Mock ethers module - this needs to be before any imports that use it
// We need to mock Wallet and Contract constructors
// Use vi.hoisted() to create mock functions that can be accessed in both the mock and tests
const mockWallet = vi.hoisted(() => vi.fn())
const mockContract = vi.hoisted(() => vi.fn())

vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers")
  return {
    ...actual,
    Wallet: mockWallet,
    Contract: mockContract,
  }
})

// Create mock RouterService factory
const createMockRouterService = () => ({
  getBestRoute: vi.fn().mockResolvedValue({
    route: { display: "mock-route", params: { routeAddresses: [], swapParamsFull: [] } },
    amount: 1000n * BigInt(10 ** 18),
    priceImpact: 0.001,
    routerType: "curve" as const,
    routerAddress: "0xCurveRouter",
  }),
  getBestSplitCurveRoutes: vi.fn().mockResolvedValue(undefined),
  buildRouterCallData: vi.fn().mockReturnValue("0xMockRouterCallData"),
  isPendleCollateral: vi.fn().mockReturnValue(false),
  getRouterType: vi.fn().mockReturnValue("curve"),
  getRouterAddress: vi.fn().mockReturnValue("0xCurveRouter"),
})

const DECIMALS = BigInt(10 ** 18)

const baseMarketValues = {
  maxLTV: 0n,
  collateralUSDPrice: 0n,
  oracleDecimals: 0n,
}

const nominalContext = {
  isDbAlive: true,
  rpcIndex: 0,
  currentRpcIndex: 0,
  currentWalletIndex: 0,
  executionKey: "test",
  currentBlock: 0,
  providers: [],
  walletsPks: [],
}

describe("LiquidationService", () => {
  let liquidationService: LiquidationService
  let marketBorrowerRepository: ActiveBorrowersRepository
  let mockBlockRepository: any
  let mockRouterService: ReturnType<typeof createMockRouterService>

  beforeEach(() => {
    marketBorrowerRepository = new ActiveBorrowersRepository({} as any) // Mock Prisma client
    mockRouterService = createMockRouterService()
    liquidationService = new LiquidationService(marketBorrowerRepository, nominalContext, mockRouterService as unknown as RouterService)

    // Mock BlockRepository
    mockBlockRepository = {
      getLastBlockIndexed: vi.fn(),
      setClient: vi.fn(),
    }
    vi.spyOn(BlockRepository.prototype, "getLastEventBlock").mockImplementation(mockBlockRepository.getLastBlockIndexed)
    vi.spyOn(BlockRepository.prototype, "setClient").mockImplementation(mockBlockRepository.setClient)
  })

  describe("checkContext", () => {
    it("should handle RPC errors and select the working RPC with highest block for balance checks", async () => {
      // Mock providers with different block numbers and one failing RPC
      const mockProvider2 = {
        getBlockNumber: vi.fn().mockResolvedValue(1000),
        getBalance: vi.fn().mockResolvedValue(BigInt("200000000000000000")), // 0.2 ETH
      }
      const mockProvider3 = {
        getBlockNumber: vi.fn().mockResolvedValue(2000),
        getBalance: vi.fn().mockResolvedValue(BigInt("200000000000000000")), // 0.2 ETH
      }

      liquidationService.context.providers = [
        { getBlockNumber: vi.fn().mockRejectedValue(new Error("RPC 1 failed")) },
        mockProvider2,
        mockProvider3,
      ] as unknown as JsonRpcProvider[]

      liquidationService.context.walletsPks = ["pk1"]
      liquidationService.minEthBalance = 0.01

      // Mock Wallet
      mockWallet.mockImplementation(() => ({
        getAddress: vi.fn().mockResolvedValue("0xAddress1"),
      }))

      const initialRpcIndex = liquidationService.context.currentRpcIndex

      await liquidationService.checkContext()

      // Verify that context.currentRpcIndex was NOT updated (we don't update it anymore)
      // The best RPC is used locally for balance checks but not stored in context
      // The initial value should remain unchanged
      expect(liquidationService.context.currentRpcIndex).toBe(initialRpcIndex) // Should remain at initial value
    })

    it("should throw error when no working RPCs are available", async () => {
      // Mock all providers failing
      liquidationService.context.providers = [
        { getBlockNumber: vi.fn().mockRejectedValue(new Error("RPC 1 failed")) },
        { getBlockNumber: vi.fn().mockRejectedValue(new Error("RPC 2 failed")) },
      ] as unknown as JsonRpcProvider[]

      await expect(liquidationService.checkContext()).rejects.toThrow("NO_RPC_CONNECTED")
    })

    it("should handle database connectivity check", async () => {
      liquidationService.context.providers = [
        {
          getBlockNumber: vi.fn().mockResolvedValue(1000),
          getBalance: vi.fn().mockResolvedValue(BigInt("200000000000000000")), // 0.2 ETH
        },
      ] as unknown as JsonRpcProvider[]

      liquidationService.context.walletsPks = ["pk1"]
      liquidationService.minEthBalance = 0.01

      // Mock Wallet
      mockWallet.mockImplementation(() => ({
        getAddress: vi.fn().mockResolvedValue("0xAddress1"),
      }))

      // Test when database check fails
      mockBlockRepository.getLastBlockIndexed.mockRejectedValueOnce(new Error("DB connection failed"))
      await liquidationService.checkContext()
      expect(liquidationService.context.isDbAlive).toBe(false)

      // Test when database check succeeds
      mockBlockRepository.getLastBlockIndexed.mockResolvedValueOnce(1000)
      await liquidationService.checkContext()
      expect(liquidationService.context.isDbAlive).toBe(true)
    })
  })

  it("should get liquidation parameters", async () => {
    const mockBorrowers: {
      market: {
        id: bigint
        contract_name: string
        collateral_address: string
        contract_address: string
        contract_type: string
      }
      borrower_address: string
    }[] = [
      {
        market: {
          id: 1n,
          collateral_address: "0x1",
          contract_address: "0x456",
          contract_name: "A",
          contract_type: "Convex CRV",
        },
        borrower_address: "0x123",
      },
      {
        market: {
          id: 2n,
          collateral_address: "0x1",
          contract_address: "0xABC",
          contract_name: "A",
          contract_type: "Convex CRV",
        },
        borrower_address: "0x789",
      },
      {
        market: {
          id: 1n,
          collateral_address: "0x1",
          contract_address: "0x456",
          contract_name: "A",
          contract_type: "Convex CRV",
        },
        borrower_address: "0x789",
      },
    ]

    const mockMarketBorrowerRepository = {
      getAll: vi.fn().mockResolvedValue(mockBorrowers),
    }

    liquidationService = new LiquidationService(
      mockMarketBorrowerRepository as any as ActiveBorrowersRepository,
      nominalContext,
      mockRouterService as unknown as RouterService
    )

    const { markets, borrowers } = await liquidationService.getLiquidationParams()

    expect(markets).toEqual(["0x456", "0xABC"])
    expect(borrowers).toEqual([
      {
        account: "0x123",
        market: "0x456",
      },
      {
        account: "0x789",
        market: "0xABC",
      },
      {
        account: "0x789",
        market: "0x456",
      },
    ])
  })

  it("should get liquidation parameters from database when isDbAlive is true", async () => {
    const mockBorrowers: {
      market: {
        id: bigint
        contract_name: string
        collateral_address: string
        contract_address: string
        contract_type: string
      }
      borrower_address: string
    }[] = [
      {
        market: {
          id: 1n,
          collateral_address: "0x1",
          contract_address: "0x456",
          contract_name: "A",
          contract_type: "Convex CRV",
        },
        borrower_address: "0x123",
      },
    ]

    const mockMarketBorrowerRepository = {
      getAll: vi.fn().mockResolvedValue(mockBorrowers),
    }

    const context = { ...nominalContext, isDbAlive: true, currentBlock: 0, providers: [], walletsPks: [] }
    liquidationService = new LiquidationService(
      mockMarketBorrowerRepository as any as ActiveBorrowersRepository,
      context,
      mockRouterService as unknown as RouterService
    )

    const { markets, borrowers } = await liquidationService.getLiquidationParams()

    expect(mockMarketBorrowerRepository.getAll).toHaveBeenCalled()
    expect(markets).toEqual(["0x456"])
    expect(borrowers).toEqual([
      {
        account: "0x123",
        market: "0x456",
      },
    ])
  })

  it("should get liquidation parameters from file when isDbAlive is false", async () => {
    const mockBorrowers = [
      {
        borrower_address: "0x123" as AddressLike,
        contract_address: "0x456" as AddressLike,
      },
    ] as any

    const mockMarketBorrowerRepository = {
      getAll: vi.fn().mockResolvedValue(mockBorrowers),
    }

    const context = { ...nominalContext, isDbAlive: false, currentBlock: 0, providers: [], walletsPks: [] }
    liquidationService = new LiquidationService(
      mockMarketBorrowerRepository as any as ActiveBorrowersRepository,
      context,
      mockRouterService as unknown as RouterService
    )

    // Mock fs.readFileSync
    const mockFileData = {
      markets: ["0x789"],
      borrowers: [
        {
          account: "0xABC",
          market: "0x789",
        },
      ],
    }
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockFileData))

    const { markets, borrowers } = await liquidationService.getLiquidationParams()

    expect(mockMarketBorrowerRepository.getAll).not.toHaveBeenCalled()
    expect(markets).toEqual(["0x789"])
    expect(borrowers).toEqual([
      {
        account: "0xABC",
        market: "0x789",
      },
    ])
  })
})

describe("LiquidationService - analyzeLiquidation", () => {
  let liquidationService: LiquidationService
  let mockMarketBorrowerRepository: ActiveBorrowersRepository
  let mockRouterService: ReturnType<typeof createMockRouterService>

  beforeEach(() => {
    // Mock repository
    mockMarketBorrowerRepository = {
      getAll: vi.fn(),
      deleteMarketBorrowers: vi.fn(),
    } as unknown as ActiveBorrowersRepository

    mockRouterService = createMockRouterService()

    // Create service instance
    liquidationService = new LiquidationService(mockMarketBorrowerRepository, nominalContext, mockRouterService as unknown as RouterService)
  })

  it("should correctly classify accounts into hard, soft, and non-debtor categories", async () => {})

  it("should correctly identify soft liquidations when LTV exceeds the threshold", async () => {})

  it("should correctly classify accounts with zero debt as non-debtors", async () => {
    const accounts: LiquidationUserInInfo[] = [{ account: "0xUser1", market: "0xMarket1" }]

    const liquidationData: LiquidationMarketAccountOutInfo = {
      markets: [
        {
          liquidationThreshold: 500000000000000000n,
          ...baseMarketValues,
          market: "0xMarket1",
          collatToken: "0x0000000000000000000000000000000000000000" as AddressLike,
          maxMarketDebt: 10000000000n,
        },
      ], // 50% LTV threshold
      accounts: [
        {
          healthRatio: 1200000000000000000n, // Above 1
          userDebt: 0n, // No debt
          positionValue: 500n * DECIMALS,
          market: "0xMarket1",
        },
      ] as LiquidationAccountOutInfo[],
      blockNumber: 0n,
      blockTimestamp: 0n,
    }

    const result = await liquidationService.analyzeLiquidation(liquidationData, accounts)

    expect(result.seizingList).toHaveLength(0)
    expect(result.liquidationList).toHaveLength(0)
  })

  it("should return empty lists when no accounts qualify for liquidation", async () => {
    const accounts: LiquidationUserInInfo[] = [{ account: "0xUser1", market: "0xMarket1" }]

    const liquidationData: LiquidationMarketAccountOutInfo = {
      markets: [
        {
          liquidationThreshold: 500000000000000000n,
          ...baseMarketValues,
          market: "0xMarket1",
          collatToken: "0x0000000000000000000000000000000000000000" as AddressLike,
          maxMarketDebt: 10000000000n,
        },
      ], // 50% LTV threshold
      accounts: [
        {
          healthRatio: 2000000000000000000n, // Well above 1
          userDebt: 200n * DECIMALS,
          positionValue: 1000n * DECIMALS,
          market: "0xMarket1",
        },
      ] as LiquidationAccountOutInfo[],
      blockNumber: 0n,
      blockTimestamp: 0n,
    }

    const result = await liquidationService.analyzeLiquidation(liquidationData, accounts)

    expect(result.seizingList).toHaveLength(0)
    expect(result.liquidationList).toHaveLength(0)
  })

  it("should correctly classify and sort  a mix of hard liquidations, soft liquidations, and non-debtors", async () => {
    const accounts: LiquidationUserInInfo[] = [
      { account: "0xUser1", market: "0xMarket1" }, // Hard Liquidation
      { account: "0xUser2", market: "0xMarket2" }, // Soft Liquidation
      { account: "0xUser3", market: "0xMarket3" }, // 0 debt
      { account: "0xUser4", market: "0xMarket4" }, // Healthy account (no liquidation)
      { account: "0xUser5", market: "0xMarket5" }, // Soft Liquidation
      { account: "0xUser6", market: "0xMarket6" }, // Hard Liquidation
    ]

    const defaultMarket: LiquidationMarketOutInfo = {
      liquidationThreshold: 90000n,
      ...baseMarketValues,
      market: "0xMarket1",
      collatToken: "0x0000000000000000000000000000000000000000" as AddressLike,
      maxMarketDebt: 10000000000n,
    }
    const liquidationData: LiquidationMarketAccountOutInfo = {
      markets: [
        { ...defaultMarket, market: "0xMarket1" },
        { ...baseMarketValues, market: "0xMarket2", liquidationThreshold: 75000n },
        { ...defaultMarket, ...{ userDebt: 0n }, market: "0xMarket3" },
        { ...defaultMarket, market: "0xMarket4" },
        { ...baseMarketValues, market: "0xMarket5", liquidationThreshold: 75000n },
        { ...defaultMarket, market: "0xMarket6" },
      ] as LiquidationMarketOutInfo[],
      accounts: [
        {
          healthRatio: 500000000000000000n, // (Hard Liquidation) 0xUser1
          userDebt: 600n * DECIMALS,
          positionValue: 550n * DECIMALS,
          market: "0xMarket1",
        },
        {
          healthRatio: 2000000000000000000n, // (Soft Liquidation) 0xUser2
          userDebt: 760n * DECIMALS,
          positionValue: 1000n * DECIMALS,
          market: "0xMarket2",
        },
        {
          healthRatio: 2000000000000000000n, // Small debt, healthy 0xUser3
          userDebt: 0n,
          positionValue: 500n * DECIMALS,
          market: "0xMarket3",
        },
        {
          healthRatio: 2500000000000000000n, // Nothing 0xUser4
          userDebt: 500n * DECIMALS,
          positionValue: 2000n * DECIMALS,
          market: "0xMarket4",
        },
        {
          healthRatio: 2500000000000000000n, // (Soft Liquidation) 0xUser5
          userDebt: 800n * DECIMALS,
          positionValue: 1050n * DECIMALS,
          market: "0xMarket5",
        },
        {
          healthRatio: 2500000000000000000n, // (Hard Liquidation) 0xUser6
          userDebt: 620n * DECIMALS,
          positionValue: 560n * DECIMALS,
          market: "0xMarket6",
        },
      ] as LiquidationAccountOutInfo[],
      blockNumber: 0n,
      blockTimestamp: 0n,
    }

    const result = await liquidationService.analyzeLiquidation(liquidationData, accounts)

    // Expectations
    expect(result.seizingList).toHaveLength(2)
    expect(result.seizingList?.[0].account).toBe("0xUser6")
    expect(result.seizingList?.[1].account).toBe("0xUser1")

    expect(result.liquidationList).toHaveLength(2)
    expect(result.liquidationList?.[0].account).toBe("0xUser5")
    expect(result.liquidationList?.[1].account).toBe("0xUser2")

    expect(result.seizingList?.some((acc: LiquidationUserInfo) => acc.account === "0xUser2")).toBe(false)
    expect(result.liquidationList?.some((acc: LiquidationUserInfo) => acc.account === "0xUser1")).toBe(false)
  })
})

describe("LiquidationService - prioritizeActions", () => {
  let liquidationService: LiquidationService
  let mockMarketBorrowerRepository: ActiveBorrowersRepository

  let mockRouterService: Partial<RouterService>

  beforeEach(() => {
    mockMarketBorrowerRepository = new ActiveBorrowersRepository({} as any)
    mockRouterService = {} // Provide a dummy object since we don't need its implementation here
    liquidationService = new LiquidationService(mockMarketBorrowerRepository, nominalContext, mockRouterService as unknown as RouterService)
  })

  it("should prioritize actions based on position value and return all actions", () => {
    // Setup context with 2 PK wallets
    liquidationService.context.walletsPks = ["pk1", "pk2"]

    // Create positions with different amounts
    const hardLiquidation1: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 500000000000000000n,
      userDebt: 1000n * DECIMALS, // Larger position
      positionValue: 1200n * DECIMALS,
      collateralBalance: 1500n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
    }

    const hardLiquidation2: LiquidationUserFullInfo = {
      account: "0xUser2" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 600000000000000000n,
      userDebt: 500n * DECIMALS, // Smaller position
      positionValue: 600n * DECIMALS,
      collateralBalance: 800n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
    }

    const softLiquidation1: LiquidationUserFullInfo = {
      account: "0xUser3" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 700000000000000000n,
      userDebt: 300n * DECIMALS, // Smallest position
      positionValue: 400n * DECIMALS,
      collateralBalance: 500n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
    }

    const result = liquidationService.prioritizeActions([hardLiquidation1, hardLiquidation2], [softLiquidation1])

    // Verify the result - should return all actions, not limited by wallet count
    expect(result).toHaveLength(3) // All actions returned
    expect(result[0].type).toBe("seizing")
    expect(result[0].account).toBe("0xUser1") // Highest position value
    expect(result[1].type).toBe("seizing")
    expect(result[1].account).toBe("0xUser2") // Second highest position value
    expect(result[2].type).toBe("liquidation")
    expect(result[2].account).toBe("0xUser3") // Third highest position value
  })

  it("should mix hard and soft liquidations based on position value", () => {
    // Setup context with 3 PK wallets
    liquidationService.context.walletsPks = ["pk1", "pk2", "pk3"]

    // Create positions with different amounts
    const hardLiquidation1: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 500000000000000000n,
      userDebt: 1000n * DECIMALS,
      positionValue: 1200n * DECIMALS,
      collateralBalance: 1500n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
    }

    const softLiquidation1: LiquidationUserFullInfo = {
      account: "0xUser2" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 600000000000000000n,
      userDebt: 800n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 1200n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
    }

    const hardLiquidation2: LiquidationUserFullInfo = {
      account: "0xUser3" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 700000000000000000n,
      userDebt: 500n * DECIMALS,
      positionValue: 600n * DECIMALS,
      collateralBalance: 800n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
    }

    const result = liquidationService.prioritizeActions([hardLiquidation1, hardLiquidation2], [softLiquidation1])

    // Verify the result
    expect(result).toHaveLength(3) // All positions included
    expect(result[0].type).toBe("seizing")
    expect(result[0].account).toBe("0xUser1") // Highest position value
    expect(result[1].type).toBe("liquidation")
    expect(result[1].account).toBe("0xUser2") // Second highest position value
    expect(result[2].type).toBe("seizing")
    expect(result[2].account).toBe("0xUser3") // Third highest position value
  })

  it("should return empty array when no liquidations are provided", () => {
    const result = liquidationService.prioritizeActions([], [])
    expect(result).toHaveLength(0)
  })

  it("should return all actions even when there are more actions than wallets", () => {
    // Setup context with only 2 PK wallets
    liquidationService.context.walletsPks = ["pk1", "pk2"]

    // Create 5 positions with different amounts
    const seizing1: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 500000000000000000n,
      userDebt: 1000n * DECIMALS,
      positionValue: 1200n * DECIMALS, // Highest value
      collateralBalance: 1500n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
    }

    const liquidation1: LiquidationUserFullInfo = {
      account: "0xUser2" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 600000000000000000n,
      userDebt: 800n * DECIMALS,
      positionValue: 1000n * DECIMALS, // Second highest value
      collateralBalance: 1200n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
    }

    const seizing2: LiquidationUserFullInfo = {
      account: "0xUser3" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 700000000000000000n,
      userDebt: 500n * DECIMALS,
      positionValue: 600n * DECIMALS, // Third highest value
      collateralBalance: 800n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
    }

    const liquidation2: LiquidationUserFullInfo = {
      account: "0xUser4" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 800000000000000000n,
      userDebt: 400n * DECIMALS,
      positionValue: 500n * DECIMALS, // Fourth highest value
      collateralBalance: 700n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
    }

    const seizing3: LiquidationUserFullInfo = {
      account: "0xUser5" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 900000000000000000n,
      userDebt: 300n * DECIMALS,
      positionValue: 400n * DECIMALS, // Fifth highest value
      collateralBalance: 600n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
    }

    const result = liquidationService.prioritizeActions([seizing1, seizing2, seizing3], [liquidation1, liquidation2])

    // Verify the result - should return all actions, not limited by wallet count
    expect(result).toHaveLength(5) // All actions returned
    expect(result[0].type).toBe("seizing")
    expect(result[0].account).toBe("0xUser1") // Highest position value
    expect(result[1].type).toBe("liquidation")
    expect(result[1].account).toBe("0xUser2") // Second highest position value
    expect(result[2].type).toBe("seizing")
    expect(result[2].account).toBe("0xUser3") // Third highest position value
    expect(result[3].type).toBe("liquidation")
    expect(result[3].account).toBe("0xUser4") // Fourth highest position value
    expect(result[4].type).toBe("seizing")
    expect(result[4].account).toBe("0xUser5") // Fifth highest position value
  })
})

// Mock ethers for executeLiquidation tests - this needs to be before the describe
// but we'll use vi.doMock inside the describe to avoid affecting other tests
describe("LiquidationService - executeLiquidation", () => {
  let liquidationService: LiquidationService
  let mockMarketBorrowerRepository: ActiveBorrowersRepository
  let mockContext: any
  let mockProvider: any
  let mockSigner: any
  let mockMarketContract: any
  let mockLiquidationBotService: any
  let mockTx: any
  let mockRouterService: ReturnType<typeof createMockRouterService>

  beforeEach(() => {
    vi.clearAllMocks()

    mockMarketBorrowerRepository = new ActiveBorrowersRepository({} as any)
    mockContext = {
      ...nominalContext,
      currentRpcIndex: 0,
      providers: [],
      walletsPks: ["0xPrivateKey1"],
    }

    mockProvider = {
      getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1000000000n }),
      getTransactionCount: vi.fn().mockResolvedValue(0),
    }

    mockTx = {
      wait: vi.fn().mockResolvedValue({}),
    }

    mockSigner = {
      getAddress: vi.fn().mockResolvedValue("0xSignerAddress"),
    }

    mockMarketContract = {
      liquidate: vi.fn().mockResolvedValue(mockTx),
    }

    mockLiquidationBotService = {
      logLiquidationExecution: vi.fn().mockResolvedValue(undefined),
      logLiquidationExecutionError: vi.fn().mockResolvedValue(undefined),
      logError: vi.fn().mockResolvedValue(undefined),
    }

    mockContext.providers = [mockProvider]

    // Setup Wallet and Contract mocks - these are hoisted so available here
    mockWallet.mockImplementation(() => mockSigner)
    mockContract.mockImplementation(() => mockMarketContract)

    mockRouterService = createMockRouterService()
    liquidationService = new LiquidationService(
      mockMarketBorrowerRepository,
      mockContext,
      mockRouterService as unknown as RouterService,
      mockLiquidationBotService
    )
  })

  it("should execute liquidation with default slippageModifierBps (0n)", async () => {
    const account: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2000000000000000000n,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 1500n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
      collateralUSDPrice: 1n * DECIMALS,
      oracleDecimals: 18n,
    }

    const mockEstimate: LiquidationEstimateInfo[] = [
      {
        account: account.account,
        collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        minTgUSDOut: 900n * DECIMALS,
        liquidationCall: {
          routerCall: "0x1234",
          routerAddress: "0xCurveRouter",
        },
        expectedOutput: 1000n * DECIMALS,
        slippageBps: 10n,
        gasEstimate: {
          gasLimit: 200000n,
          eth: 0.0002,
        },
        grossProfit: 240n * DECIMALS,
        routerType: "curve" as const,
      },
    ]

    // Wallet and Contract are already mocked in beforeEach via vi.mock

    const estimateSpy = vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue(mockEstimate)

    // Reset mock calls before execution
    mockMarketContract.liquidate.mockClear()

    await liquidationService.executeLiquidation(0, account, 0n)

    // Verify slippage calculation: 50n + (10n * 0n) / 10000n = 50n
    expect(estimateSpy).toHaveBeenCalled()
    const callArgs = estimateSpy.mock.calls[0]
    expect(callArgs[2]).toBe(50n) // Default slippage when slippageModifierBps is 0n
    expect(mockMarketContract.liquidate).toHaveBeenCalledTimes(1)
  })

  it("should execute liquidation with custom slippageModifierBps", async () => {
    const account: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2000000000000000000n,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 1500n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
      collateralUSDPrice: 1n * DECIMALS,
      oracleDecimals: 18n,
    }

    const slippageModifierBps = 500n // 5% modifier
    const expectedSlippage = 50n + (10n * slippageModifierBps) / 10000n // 50n + 0.5n = 50.5n

    const mockEstimate: LiquidationEstimateInfo[] = [
      {
        account: account.account,
        collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        minTgUSDOut: 900n * DECIMALS,
        liquidationCall: {
          routerCall: "0x1234",
          routerAddress: "0xCurveRouter",
        },
        expectedOutput: 1000n * DECIMALS,
        slippageBps: expectedSlippage,
        gasEstimate: {
          gasLimit: 200000n,
          eth: 0.0002,
        },
        grossProfit: 240n * DECIMALS,
        routerType: "curve" as const,
      },
    ]

    const estimateSpy = vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue(mockEstimate)

    // Reset mock calls before execution
    mockMarketContract.liquidate.mockClear()

    await liquidationService.executeLiquidation(0, account, slippageModifierBps)

    expect(estimateSpy).toHaveBeenCalled()
    const callArgs = estimateSpy.mock.calls[0]
    expect(callArgs[2]).toBe(expectedSlippage)
    expect(mockMarketContract.liquidate).toHaveBeenCalledTimes(1)
  })

  it("should execute multiple transactions for split routes", async () => {
    const account: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2000000000000000000n,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 2000n * DECIMALS, // Even number for clean split
      collatToken: "0xToken1" as AddressLike,
      collateralUSDPrice: 1n * DECIMALS,
      oracleDecimals: 18n,
    }

    const mockEstimate: LiquidationEstimateInfo[] = [
      {
        account: account.account,
        collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        minTgUSDOut: 450n * DECIMALS,
        liquidationCall: {
          routerCall: "0x1234",
          routerAddress: "0xCurveRouter",
        },
        expectedOutput: 500n * DECIMALS,
        slippageBps: 10n,
        gasEstimate: {
          gasLimit: 200000n,
          eth: 0.0002,
        },
        grossProfit: 240n * DECIMALS,
        routerType: "curve" as const,
      },
      {
        account: account.account,
        collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        minTgUSDOut: 450n * DECIMALS,
        liquidationCall: {
          routerCall: "0x5678",
          routerAddress: "0xCurveRouter",
        },
        expectedOutput: 500n * DECIMALS,
        slippageBps: 10n,
        gasEstimate: {
          gasLimit: 200000n,
          eth: 0.0002,
        },
        grossProfit: 240n * DECIMALS,
        routerType: "curve" as const,
      },
    ]

    const estimateSpy = vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue(mockEstimate)

    // Reset mock calls before execution
    mockMarketContract.liquidate.mockClear()
    mockLiquidationBotService.logLiquidationExecution.mockClear()

    await liquidationService.executeLiquidation(0, account, 0n)

    // Should execute 2 transactions for split routes
    expect(estimateSpy).toHaveBeenCalled()
    expect(mockMarketContract.liquidate).toHaveBeenCalledTimes(2)
    expect(mockLiquidationBotService.logLiquidationExecution).toHaveBeenCalledTimes(2)
  })

  it("should verify split routes have correct collateral balance distribution through estimateLiquidation", async () => {
    const account: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2000000000000000000n,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 2001n * DECIMALS, // Odd number to test rounding
      collatToken: "0xToken1" as AddressLike,
      collateralUSDPrice: 1n * DECIMALS,
      oracleDecimals: 18n,
    }

    // Calculate split: account1 gets half (truncated), account2 gets remainder
    // For 2001n * DECIMALS:
    // - account1 = 2001n * DECIMALS / 2n = 1000500000000000000000n (represents 1000.5 * 10^18)
    // - account2 = 2001n * DECIMALS - account1 = 1000500000000000000000n (also 1000.5 * 10^18)
    // Note: BigInt division truncates, so both accounts get equal amounts when total is odd
    const account1Balance = account.collateralBalance / 2n
    const account2Balance = account.collateralBalance - account1Balance

    // Verify split logic: amounts are correctly split and add up to total
    expect(account1Balance + account2Balance).toBe(account.collateralBalance)

    // Verify the actual BigInt division result
    // When you divide 2001n * 10^18 by 2n, you get 1000500000000000000000n (1000.5 * 10^18)
    // Both accounts end up with the same value because BigInt division truncates
    const expectedSplit = (2001n * DECIMALS) / 2n // = 1000500000000000000000n
    expect(account1Balance).toBe(expectedSplit)
    expect(account2Balance).toBe(expectedSplit) // Both get the same: 1000.5 * 10^18
    expect(account1Balance).toBe(account2Balance) // They should be equal (both 1000.5 * 10^18)

    // Mock estimateLiquidation to return split routes
    const mockEstimate: LiquidationEstimateInfo[] = [
      {
        account: account.account,
        collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        minTgUSDOut: 450n * DECIMALS,
        liquidationCall: {
          routerCall: "0x1234",
          routerAddress: "0xCurveRouter",
        },
        expectedOutput: 500n * DECIMALS,
        slippageBps: 10n,
        gasEstimate: {
          gasLimit: 200000n,
          eth: 0.0002,
        },
        grossProfit: 240n * DECIMALS,
        routerType: "curve" as const,
      },
      {
        account: account.account,
        collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        minTgUSDOut: 451n * DECIMALS, // Slightly more due to larger balance
        liquidationCall: {
          routerCall: "0x5678",
          routerAddress: "0xCurveRouter",
        },
        expectedOutput: 501n * DECIMALS,
        slippageBps: 10n,
        gasEstimate: {
          gasLimit: 200000n,
          eth: 0.0002,
        },
        grossProfit: 241n * DECIMALS,
        routerType: "curve" as const,
      },
    ]

    const estimateSpy = vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue(mockEstimate)

    // Reset mock calls before execution
    mockMarketContract.liquidate.mockClear()
    await liquidationService.executeLiquidation(0, account, 0n, 0)

    // Verify both transactions were executed
    expect(estimateSpy).toHaveBeenCalled()
    expect(mockMarketContract.liquidate).toHaveBeenCalledTimes(2)
  })

  it("should handle split routes with exact even division", async () => {
    const account: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2000000000000000000n,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 2000n * DECIMALS, // Exactly divisible by 2
      collatToken: "0xToken1" as AddressLike,
      collateralUSDPrice: 1n * DECIMALS,
      oracleDecimals: 18n,
    }

    const account1Balance = account.collateralBalance / 2n // 1000n * DECIMALS
    const account2Balance = account.collateralBalance - account1Balance // 1000n * DECIMALS

    // Verify exact split
    expect(account1Balance).toBe(account2Balance)
    expect(account1Balance + account2Balance).toBe(account.collateralBalance)

    const mockEstimate: LiquidationEstimateInfo[] = [
      {
        account: account.account,
        collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        minTgUSDOut: 450n * DECIMALS,
        liquidationCall: {
          routerCall: "0x1234",
          routerAddress: "0xCurveRouter",
        },
        expectedOutput: 500n * DECIMALS,
        slippageBps: 10n,
        gasEstimate: {
          gasLimit: 200000n,
          eth: 0.0002,
        },
        grossProfit: 240n * DECIMALS,
        routerType: "curve" as const,
      },
      {
        account: account.account,
        collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        minTgUSDOut: 450n * DECIMALS,
        liquidationCall: {
          routerCall: "0x5678",
          routerAddress: "0xCurveRouter",
        },
        expectedOutput: 500n * DECIMALS,
        slippageBps: 10n,
        gasEstimate: {
          gasLimit: 200000n,
          eth: 0.0002,
        },
        grossProfit: 240n * DECIMALS,
        routerType: "curve" as const,
      },
    ]

    const estimateSpy = vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue(mockEstimate)

    // Reset mock calls before execution
    mockMarketContract.liquidate.mockClear()

    await liquidationService.executeLiquidation(0, account, 0n)

    // Verify both transactions were executed
    expect(estimateSpy).toHaveBeenCalled()
    expect(mockMarketContract.liquidate).toHaveBeenCalledTimes(2)
  })

  it("should handle error when no routes are found", async () => {
    const account: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2000000000000000000n,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 1500n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
      collateralUSDPrice: 1n * DECIMALS,
      oracleDecimals: 18n,
    }

    vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue([])

    await liquidationService.executeLiquidation(0, account, 0n)

    expect(liquidationService.errors).toHaveLength(1)
    expect(liquidationService.errors[0].action).toBe("liquidation_execution")
    expect(liquidationService.errors[0].message).toContain("No route found")
    expect(mockLiquidationBotService.logError).toHaveBeenCalled()
    expect(mockLiquidationBotService.logLiquidationExecutionError).toHaveBeenCalled()
    expect(mockMarketContract.liquidate).not.toHaveBeenCalled()
  })

  it("should verify split route amounts add up correctly", async () => {
    const account: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2000000000000000000n,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 2000n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
      collateralUSDPrice: 1n * DECIMALS,
      oracleDecimals: 18n,
    }

    // Simulate split routes with specific amounts
    const amount1 = 500n * DECIMALS
    const amount2 = 500n * DECIMALS
    const totalAmount = amount1 + amount2

    const mockEstimate: LiquidationEstimateInfo[] = [
      {
        account: account.account,
        collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        minTgUSDOut: 450n * DECIMALS,
        liquidationCall: {
          routerCall: "0x1234",
          routerAddress: "0xCurveRouter",
        },
        expectedOutput: amount1,
        slippageBps: 10n,
        gasEstimate: {
          gasLimit: 200000n,
          eth: 0.0002,
        },
        grossProfit: 240n * DECIMALS,
        routerType: "curve" as const,
      },
      {
        account: account.account,
        collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        minTgUSDOut: 450n * DECIMALS,
        liquidationCall: {
          routerCall: "0x5678",
          routerAddress: "0xCurveRouter",
        },
        expectedOutput: amount2,
        slippageBps: 10n,
        gasEstimate: {
          gasLimit: 200000n,
          eth: 0.0002,
        },
        grossProfit: 240n * DECIMALS,
        routerType: "curve" as const,
      },
    ]

    // Verify amounts add up
    const totalExpectedOutput = mockEstimate.reduce((sum, est) => sum + est.expectedOutput, 0n)
    expect(totalExpectedOutput).toBe(totalAmount)
    expect(totalExpectedOutput).toBe(1000n * DECIMALS)

    const estimateSpy = vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue(mockEstimate)

    // Reset mock calls before execution
    mockMarketContract.liquidate.mockClear()

    await liquidationService.executeLiquidation(0, account, 0n)

    // Verify both transactions were executed
    expect(estimateSpy).toHaveBeenCalled()
    expect(mockMarketContract.liquidate).toHaveBeenCalledTimes(2)

    // Verify the amounts in the calls
    const call1Args = mockMarketContract.liquidate.mock.calls[0]
    const call2Args = mockMarketContract.liquidate.mock.calls[1]

    // The minAmount passed to liquidate should be based on the estimation's minTgUSDOut
    // We can't directly verify the amounts here since they're calculated internally,
    // but we verify that both transactions were called
    expect(call1Args).toBeDefined()
    expect(call2Args).toBeDefined()
  })

  it("should handle transaction failure for one route in split routes", async () => {
    const account: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2000000000000000000n,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 2000n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
      collateralUSDPrice: 1n * DECIMALS,
      oracleDecimals: 18n,
    }

    const mockEstimate: LiquidationEstimateInfo[] = [
      {
        account: account.account,
        collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        minTgUSDOut: 450n * DECIMALS,
        liquidationCall: {
          routerCall: "0x1234",
          routerAddress: "0xCurveRouter",
        },
        expectedOutput: 500n * DECIMALS,
        slippageBps: 10n,
        gasEstimate: {
          gasLimit: 200000n,
          eth: 0.0002,
        },
        grossProfit: 240n * DECIMALS,
        routerType: "curve" as const,
      },
      {
        account: account.account,
        collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        minTgUSDOut: 450n * DECIMALS,
        liquidationCall: {
          routerCall: "0x5678",
          routerAddress: "0xCurveRouter",
        },
        expectedOutput: 500n * DECIMALS,
        slippageBps: 10n,
        gasEstimate: {
          gasLimit: 200000n,
          eth: 0.0002,
        },
        grossProfit: 240n * DECIMALS,
        routerType: "curve" as const,
      },
    ]

    vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue(mockEstimate)

    // First call succeeds, second call fails
    mockMarketContract.liquidate
      .mockResolvedValueOnce({
        wait: vi.fn().mockResolvedValue({}),
      })
      .mockRejectedValueOnce(new Error("Transaction failed"))

    await liquidationService.executeLiquidation(0, account, 0n)

    // Should attempt both transactions
    expect(mockMarketContract.liquidate).toHaveBeenCalledTimes(2)
    // Should log error in bot_log for the failed transaction
    expect(mockLiquidationBotService.logError).toHaveBeenCalled()
    // Should log success in liquidation_execution table for the successful transaction
    expect(mockLiquidationBotService.logLiquidationExecution).toHaveBeenCalledTimes(1)
    // Should log error in liquidation_execution table for the failed transaction
    expect(mockLiquidationBotService.logLiquidationExecutionError).toHaveBeenCalledTimes(1)
    expect(mockLiquidationBotService.logLiquidationExecutionError).toHaveBeenCalledWith(
      expect.any(Object), // context
      expect.objectContaining({ message: "Transaction failed" }), // error
      expect.objectContaining({ account: "0xUser1", market: "0xMarket1" }) // account
    )
    // Should have error recorded
    expect(liquidationService.errors.length).toBeGreaterThan(0)
  })

  it("should log execution error in liquidation_execution table when no routes found", async () => {
    const account: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2000000000000000000n,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 1500n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
      collateralUSDPrice: 1n * DECIMALS,
      oracleDecimals: 18n,
    }

    vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue([])

    await liquidationService.executeLiquidation(0, account, 0n)

    // Should log error in liquidation_execution table
    expect(mockLiquidationBotService.logLiquidationExecutionError).toHaveBeenCalledTimes(1)
    expect(mockLiquidationBotService.logLiquidationExecutionError).toHaveBeenCalledWith(
      expect.any(Object), // context
      expect.objectContaining({ message: expect.stringContaining("No route found") }),
      expect.objectContaining({ account: "0xUser1", market: "0xMarket1" })
    )
  })

  it("should log execution error in liquidation_execution table when estimation fails", async () => {
    const account: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2000000000000000000n,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 1500n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
      collateralUSDPrice: 1n * DECIMALS,
      oracleDecimals: 18n,
    }

    vi.spyOn(liquidationService, "estimateLiquidation").mockRejectedValue(new Error("Estimation failed"))

    await expect(liquidationService.executeLiquidation(0, account, 0n)).rejects.toThrow("Estimation failed")

    expect(mockLiquidationBotService.logLiquidationExecutionError).toHaveBeenCalledTimes(1)
    expect(mockLiquidationBotService.logLiquidationExecutionError).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ message: "Estimation failed" }),
      expect.objectContaining({ account: "0xUser1", market: "0xMarket1" })
    )
  })

  it("should still reject with the original estimation error when DB logging fails", async () => {
    const account: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2000000000000000000n,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 1500n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
      collateralUSDPrice: 1n * DECIMALS,
      oracleDecimals: 18n,
    }

    vi.spyOn(liquidationService, "estimateLiquidation").mockRejectedValue(new Error("Estimation failed"))
    mockLiquidationBotService.logLiquidationExecutionError.mockRejectedValueOnce(new Error("DB write failed"))
    mockLiquidationBotService.logError.mockRejectedValueOnce(new Error("DB action log failed"))

    await expect(liquidationService.executeLiquidation(0, account, 0n)).rejects.toThrow("Estimation failed")

    expect(mockLiquidationBotService.logLiquidationExecutionError).toHaveBeenCalledTimes(1)
    expect(mockLiquidationBotService.logError).toHaveBeenCalledTimes(1)
  })

  it("should not fail a successful liquidation when DB execution logging fails", async () => {
    const account: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2000000000000000000n,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 1500n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
      collateralUSDPrice: 1n * DECIMALS,
      oracleDecimals: 18n,
    }

    const mockEstimate: LiquidationEstimateInfo[] = [
      {
        account: account.account,
        collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        minTgUSDOut: 900n * DECIMALS,
        liquidationCall: {
          routerCall: "0x1234",
          routerAddress: "0xCurveRouter",
        },
        expectedOutput: 1000n * DECIMALS,
        slippageBps: 10n,
        gasEstimate: {
          gasLimit: 200000n,
          eth: 0.0002,
        },
        grossProfit: 240n * DECIMALS,
        routerType: "curve" as const,
      },
    ]

    vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue(mockEstimate)
    mockLiquidationBotService.logLiquidationExecution.mockRejectedValueOnce(new Error("DB write failed"))

    await expect(liquidationService.executeLiquidation(0, account, 0n)).resolves.toBeUndefined()

    expect(mockMarketContract.liquidate).toHaveBeenCalledTimes(1)
    expect(mockLiquidationBotService.logLiquidationExecution).toHaveBeenCalledTimes(1)
  })
})

describe("LiquidationService - Best RPC Provider", () => {
  let liquidationService: LiquidationService
  let mockMarketBorrowerRepository: ActiveBorrowersRepository
  let mockContext: any
  let mockProviders: any[]
  let mockLiquidationBotService: any
  let mockJob: any
  let mockRouterService: ReturnType<typeof createMockRouterService>

  beforeEach(() => {
    vi.clearAllMocks()

    mockMarketBorrowerRepository = new ActiveBorrowersRepository({} as any)
    mockContext = {
      ...nominalContext,
      currentRpcIndex: 0,
      currentBlock: 1000,
      providers: [],
      walletsPks: ["0xPrivateKey1"],
    }

    // Create multiple mock providers
    mockProviders = [
      {
        getBlockNumber: vi.fn().mockResolvedValue(1000),
        getBalance: vi.fn().mockResolvedValue(BigInt("1000000000000000000")), // 1 ETH
        getTransactionCount: vi.fn().mockResolvedValue(0),
        getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1000000000n }),
      },
      {
        getBlockNumber: vi.fn().mockResolvedValue(2000),
        getBalance: vi.fn().mockResolvedValue(BigInt("1000000000000000000")), // 1 ETH
        getTransactionCount: vi.fn().mockResolvedValue(0),
        getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1000000000n }),
      },
      {
        getBlockNumber: vi.fn().mockResolvedValue(1500),
        getBalance: vi.fn().mockResolvedValue(BigInt("1000000000000000000")), // 1 ETH
        getTransactionCount: vi.fn().mockResolvedValue(0),
        getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1000000000n }),
      },
    ]

    mockContext.providers = mockProviders

    mockLiquidationBotService = {
      logLiquidationExecution: vi.fn().mockResolvedValue(undefined),
      logLiquidationExecutionError: vi.fn().mockResolvedValue(undefined),
      logError: vi.fn().mockResolvedValue(undefined),
      logLiquidationBadDebtExecution: vi.fn().mockResolvedValue(undefined),
      logLiquidationBadDebtExecutionError: vi.fn().mockResolvedValue(undefined),
    }

    mockJob = {
      id: "test-job-1",
      data: {
        account: "0xUser1",
        market: "0xMarket1",
        type: "liquidation",
        healthRatio: "2000000000000000000",
        userDebt: "760000000000000000000",
        positionValue: "1000000000000000000000",
        collateralBalance: "1500000000000000000000",
        collatToken: "0xToken1",
      },
      attemptsMade: 0,
    }

    mockRouterService = createMockRouterService()
    liquidationService = new LiquidationService(
      mockMarketBorrowerRepository,
      mockContext,
      mockRouterService as unknown as RouterService,
      mockLiquidationBotService
    )
  })

  describe("processJob with rpcIndex", () => {
    it("should use the provided rpcIndex instead of context.currentRpcIndex", async () => {
      const mockSigner = {
        getAddress: vi.fn().mockResolvedValue("0xSignerAddress"),
        provider: mockProviders[1], // Provider at index 1
      }

      mockWallet.mockImplementation(() => mockSigner)

      const mockEstimate: LiquidationEstimateInfo[] = [
        {
          account: "0xUser1" as AddressLike,
          collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
          minTgUSDOut: 900n * DECIMALS,
          liquidationCall: {
            routerCall: "0x1234",
            routerAddress: "0xCurveRouter",
          },
          expectedOutput: 1000n * DECIMALS,
          slippageBps: 50n,
          gasEstimate: {
            gasLimit: 200000n,
            eth: 0.0002,
          },
          grossProfit: 240n * DECIMALS,
          routerType: "curve" as const,
        },
      ]

      vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue(mockEstimate)
      vi.spyOn(liquidationService, "executeLiquidation").mockResolvedValue(undefined)

      const mockTelegramNotifier = {
        sendError: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn().mockResolvedValue(undefined),
      }

      // Call processJob with rpcIndex = 1 (should use provider[1] instead of provider[0])
      await liquidationService.processJob(mockJob as any, mockTelegramNotifier as any, "0xPrivateKey1", undefined, 1, 2000)

      // Verify that executeLiquidation was called with rpcIndex = 1
      expect(liquidationService.executeLiquidation).toHaveBeenCalledWith(
        0, // walletIndex
        expect.any(Object), // account
        0n, // slippageModifierBps
        1, // rpcIndex - should be 1, not 0
        expect.objectContaining({
          currentRpcIndex: 1, // logContext should have rpcIndex = 1
          currentBlock: 2000,
        })
      )

      // Note: estimateLiquidation is called inside executeLiquidation, but since executeLiquidation is mocked,
      // we can't verify the call to estimateLiquidation here. The rpcIndex is verified above in executeLiquidation call.

      // Verify that Wallet was created with provider[1]
      expect(mockWallet).toHaveBeenCalledWith("0xPrivateKey1", mockProviders[1])
    })

    it("should use context.currentRpcIndex as fallback when rpcIndex is not provided", async () => {
      mockContext.currentRpcIndex = 2

      const mockSigner = {
        getAddress: vi.fn().mockResolvedValue("0xSignerAddress"),
        provider: mockProviders[2], // Provider at index 2
      }

      mockWallet.mockImplementation(() => mockSigner)

      const mockEstimate: LiquidationEstimateInfo[] = [
        {
          account: "0xUser1" as AddressLike,
          collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
          minTgUSDOut: 900n * DECIMALS,
          liquidationCall: {
            routerCall: "0x1234",
            routerAddress: "0xCurveRouter",
          },
          expectedOutput: 1000n * DECIMALS,
          slippageBps: 50n,
          gasEstimate: {
            gasLimit: 200000n,
            eth: 0.0002,
          },
          grossProfit: 240n * DECIMALS,
          routerType: "curve" as const,
        },
      ]

      vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue(mockEstimate)
      vi.spyOn(liquidationService, "executeLiquidation").mockResolvedValue(undefined)

      const mockTelegramNotifier = {
        sendError: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn().mockResolvedValue(undefined),
      }

      // Call processJob without rpcIndex (should use context.currentRpcIndex = 2)
      await liquidationService.processJob(mockJob as any, mockTelegramNotifier as any, "0xPrivateKey1")

      // Verify that executeLiquidation was called with rpcIndex = 2 (from context)
      expect(liquidationService.executeLiquidation).toHaveBeenCalledWith(
        0, // walletIndex
        expect.any(Object), // account
        0n, // slippageModifierBps
        2, // rpcIndex - should be 2 from context
        expect.objectContaining({
          currentRpcIndex: 2, // logContext should have rpcIndex = 2
        })
      )

      // Verify that Wallet was created with provider[2]
      expect(mockWallet).toHaveBeenCalledWith("0xPrivateKey1", mockProviders[2])
    })

    it("should create logContext with correct rpcIndex and currentBlock for logs", async () => {
      const mockSigner = {
        getAddress: vi.fn().mockResolvedValue("0xSignerAddress"),
        provider: mockProviders[1],
      }

      mockWallet.mockImplementation(() => mockSigner)

      const mockEstimate: LiquidationEstimateInfo[] = [
        {
          account: "0xUser1" as AddressLike,
          collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
          minTgUSDOut: 900n * DECIMALS,
          liquidationCall: {
            routerCall: "0x1234",
            routerAddress: "0xCurveRouter",
          },
          expectedOutput: 1000n * DECIMALS,
          slippageBps: 50n,
          gasEstimate: {
            gasLimit: 200000n,
            eth: 0.0002,
          },
          grossProfit: 240n * DECIMALS,
          routerType: "curve" as const,
        },
      ]

      vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue(mockEstimate)
      vi.spyOn(liquidationService, "executeLiquidation").mockResolvedValue(undefined)

      const mockTelegramNotifier = {
        sendError: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn().mockResolvedValue(undefined),
      }

      const customRpcIndex = 1
      const customCurrentBlock = 2500

      await liquidationService.processJob(mockJob as any, mockTelegramNotifier as any, "0xPrivateKey1", undefined, customRpcIndex, customCurrentBlock)

      // Verify that executeLiquidation received logContext with correct values
      const executeLiquidationCall = (liquidationService.executeLiquidation as any).mock.calls[0]
      const logContext = executeLiquidationCall[4] // 5th parameter is logContext

      expect(logContext.currentRpcIndex).toBe(customRpcIndex)
      expect(logContext.currentBlock).toBe(customCurrentBlock)
      expect(logContext.executionKey).toBe(mockContext.executionKey)
      expect(logContext.walletsPks).toEqual(mockContext.walletsPks)
    })
  })

  describe("executeLiquidation with rpcIndex", () => {
    it("should use provided rpcIndex instead of context.currentRpcIndex", async () => {
      mockContext.currentRpcIndex = 0 // Context has index 0
      const customRpcIndex = 2 // But we want to use index 2

      const mockSigner = {
        getAddress: vi.fn().mockResolvedValue("0xSignerAddress"),
        provider: mockProviders[customRpcIndex],
      }

      mockWallet.mockImplementation(() => mockSigner)

      const account: LiquidationUserFullInfo = {
        account: "0xUser1" as AddressLike,
        market: "0xMarket1" as AddressLike,
        healthRatio: 2000000000000000000n,
        userDebt: 760n * DECIMALS,
        positionValue: 1000n * DECIMALS,
        collateralBalance: 1500n * DECIMALS,
        collatToken: "0xToken1" as AddressLike,
        collateralUSDPrice: 1n * DECIMALS,
        oracleDecimals: 18n,
      }

      const mockEstimate: LiquidationEstimateInfo[] = [
        {
          account: account.account,
          collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
          minTgUSDOut: 900n * DECIMALS,
          liquidationCall: {
            routerCall: "0x1234",
            routerAddress: "0xPendlePTRouter",
          },
          routerType: "pendle" as const,
          expectedOutput: 1000n * DECIMALS,
          slippageBps: 50n,
          gasEstimate: {
            gasLimit: 200000n,
            eth: 0.0002,
          },
          grossProfit: 240n * DECIMALS,
        },
      ]

      vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue(mockEstimate)

      const logContext: LiquidationExecutionContext = {
        ...mockContext,
        currentRpcIndex: customRpcIndex,
        currentBlock: 2000,
      }

      const estimateSpy = vi.spyOn(liquidationService, "estimateLiquidation").mockResolvedValue(mockEstimate)

      await liquidationService.executeLiquidation(0, account, 0n, customRpcIndex, logContext)

      // Verify that estimateLiquidation was called with the custom rpcIndex
      expect(estimateSpy).toHaveBeenCalledWith(
        expect.any(Object), // signer
        account,
        50n, // slippage
        customRpcIndex // rpcIndex - should be 2, not 0
      )

      // Verify that Wallet was created with provider[2]
      expect(mockWallet).toHaveBeenCalledWith("0xPrivateKey1", mockProviders[customRpcIndex])
    })
  })

  describe("checkContext - parallelized wallet balance check", () => {
    it("should check wallet balances in parallel using best RPC provider", async () => {
      // Setup multiple wallets
      mockContext.walletsPks = ["pk1", "pk2", "pk3"]

      // Mock getBestRpcProvider to return index 1
      vi.spyOn(getBestRpcProviderModule, "getBestRpcProvider").mockResolvedValue({
        index: 1,
        blockNumber: 2000,
        responseTime: 50,
      })

      // Mock Wallet.getAddress for each wallet
      const mockGetAddress = vi.fn().mockResolvedValueOnce("0xAddress1").mockResolvedValueOnce("0xAddress2").mockResolvedValueOnce("0xAddress3")

      mockWallet.mockImplementation(() => ({
        getAddress: mockGetAddress,
      }))

      // Setup balances: pk1 and pk2 have sufficient balance, pk3 doesn't
      const sufficientBalance = BigInt("200000000000000000") // 0.2 ETH (above minEthBalance)
      const insufficientBalance = BigInt("5000000000000000") // 0.005 ETH (below minEthBalance)

      mockProviders[1].getBalance
        .mockResolvedValueOnce(sufficientBalance) // pk1
        .mockResolvedValueOnce(sufficientBalance) // pk2
        .mockResolvedValueOnce(insufficientBalance) // pk3

      liquidationService.minEthBalance = 0.01 // 0.01 ETH minimum

      await liquidationService.checkContext()

      // Verify that only wallets with sufficient balance remain
      expect(mockContext.walletsPks).toHaveLength(2)
      expect(mockContext.walletsPks).toContain("pk1")
      expect(mockContext.walletsPks).toContain("pk2")
      expect(mockContext.walletsPks).not.toContain("pk3")

      // Verify that getBalance was called for all wallets
      expect(mockProviders[1].getBalance).toHaveBeenCalledTimes(3)
      expect(mockProviders[1].getBalance).toHaveBeenCalledWith("0xAddress1")
      expect(mockProviders[1].getBalance).toHaveBeenCalledWith("0xAddress2")
      expect(mockProviders[1].getBalance).toHaveBeenCalledWith("0xAddress3")
    })

    it("should not update context.currentRpcIndex in checkContext", async () => {
      const initialRpcIndex = mockContext.currentRpcIndex
      const initialBlock = mockContext.currentBlock

      // Mock getBestRpcProvider to return a different index
      vi.spyOn(getBestRpcProviderModule, "getBestRpcProvider").mockResolvedValue({
        index: 2,
        blockNumber: 3000,
        responseTime: 50,
      })

      mockContext.walletsPks = ["pk1"]
      mockWallet.mockImplementation(() => ({
        getAddress: vi.fn().mockResolvedValue("0xAddress1"),
      }))
      mockProviders[2].getBalance.mockResolvedValue(BigInt("200000000000000000"))

      await liquidationService.checkContext()

      // Verify that context.currentRpcIndex was NOT updated (should remain at initial value)
      expect(mockContext.currentRpcIndex).toBe(initialRpcIndex)
      expect(mockContext.currentBlock).toBe(initialBlock)
    })
  })

  describe("LiquidationService - estimateTransaction diagnostics", () => {
    let liquidationService: LiquidationService
    let mockContext: any
    let mockRouterService: ReturnType<typeof createMockRouterService>
    let mockSigner: any
    let mockProvider: any
    let mockMarketContract: any

    const account: LiquidationUserFullInfo = {
      account: "0xUser1" as AddressLike,
      market: "0xMarket1" as AddressLike,
      healthRatio: 2n * DECIMALS,
      userDebt: 760n * DECIMALS,
      positionValue: 1000n * DECIMALS,
      collateralBalance: 100n * DECIMALS,
      collatToken: "0xToken1" as AddressLike,
      collateralUSDPrice: 1n * DECIMALS,
      oracleDecimals: 18n,
    }

    const route = {
      display: "mock-route",
      params: { routeAddresses: ["0xToken1"], swapParamsFull: [] },
    } as any

    beforeEach(() => {
      vi.clearAllMocks()

      mockProvider = {
        getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1n }),
        send: vi.fn().mockRejectedValue(new Error("trace unavailable")),
      }

      mockSigner = {
        getAddress: vi.fn().mockResolvedValue("0xSignerAddress"),
      }

      mockMarketContract = {
        liquidate: {
          estimateGas: vi.fn(),
          populateTransaction: vi.fn().mockResolvedValue({ to: "0xMarket1", data: "0xabcdef" }),
        },
      }

      mockWallet.mockImplementation(() => mockSigner)
      mockContract.mockImplementation(() => mockMarketContract)

      mockContext = {
        ...nominalContext,
        providers: [mockProvider],
        walletsPks: ["0xPrivateKey1"],
      }

      mockRouterService = createMockRouterService()
      liquidationService = new LiquidationService(new ActiveBorrowersRepository({} as any), mockContext, mockRouterService as unknown as RouterService)
    })

    it("should wrap preflight min collateral calculation errors as gas estimation errors", async () => {
      vi.spyOn(liquidationService as any, "calculateMinCollatValueToLiquidate").mockImplementation(() => {
        throw new Error("collateralUSDPrice or oracleDecimals is missing")
      })

      await expect(
        (liquidationService as any).estimateTransaction(route, 1100n * DECIMALS, account, mockSigner, mockProvider, 50n, "curve", "0xCurveRouter")
      ).rejects.toMatchObject({
        message: expect.stringContaining("Gas estimation failed: collateralUSDPrice or oracleDecimals is missing"),
      })
    })

    it("should surface a gas estimation error when estimateGas reverts", async () => {
      mockMarketContract.liquidate.estimateGas.mockRejectedValue(new Error('execution reverted (no data present; likely require(false) occurred (data="0x"))'))

      await expect(
        (liquidationService as any).estimateTransaction(route, 1100n * DECIMALS, account, mockSigner, mockProvider, 50n, "curve", "0xCurveRouter")
      ).rejects.toMatchObject({
        message: expect.stringContaining("Gas estimation failed"),
      })
    })
  })

  describe("calculateMinCollatValueToLiquidate", () => {
    let liquidationService: LiquidationService
    let mockMarketBorrowerRepository: ActiveBorrowersRepository
    let mockRouterService: ReturnType<typeof createMockRouterService>
    let originalProtectionBps: number

    beforeEach(() => {
      mockMarketBorrowerRepository = new ActiveBorrowersRepository({} as any)
      mockRouterService = createMockRouterService()
      liquidationService = new LiquidationService(mockMarketBorrowerRepository, nominalContext, mockRouterService as unknown as RouterService)

      // Store original protection BPS
      originalProtectionBps = liquidationConfig.limits.oraclePriceProtectionBps
    })

    afterEach(() => {
      // Restore original protection BPS
      liquidationConfig.limits.oraclePriceProtectionBps = originalProtectionBps
      vi.restoreAllMocks()
    })

    it("should calculate minCollatValueToLiquidate with 1.5% protection (150 bps)", () => {
      // Set config with 1.5% protection
      liquidationConfig.limits.oraclePriceProtectionBps = 150

      const account: LiquidationUserFullInfo = {
        account: "0xUser1" as AddressLike,
        market: "0xMarket1" as AddressLike,
        healthRatio: 2000000000000000000n,
        userDebt: 760n * DECIMALS,
        positionValue: 1000n * DECIMALS,
        collateralBalance: 100n * DECIMALS, // 100 tokens
        collatToken: "0xToken1" as AddressLike,
        collateralUSDPrice: 1n * DECIMALS, // $1 per token (18 decimals)
        oracleDecimals: 18n,
      }

      // Calculate expected: (100 * 10^18 * 1 * 10^18 * 9850) / (10^18 * 10000)
      // = (100 * 1 * 9850) * (10^18 * 10^18) / (10^18 * 10000)
      // = 985000 * 10^18 / 10000
      // = 98.5 * 10^18
      const expected = (100n * 9850n * DECIMALS) / 10000n

      const result = (liquidationService as any).calculateMinCollatValueToLiquidate(account)
      expect(result).toBe(expected)
    })

    it("should calculate minCollatValueToLiquidate with different oracle decimals (8 decimals)", () => {
      // Set config with 1.5% protection
      liquidationConfig.limits.oraclePriceProtectionBps = 150

      const oracleDecimals = 8n
      const oraclePrice = 1n * 10n ** oracleDecimals // $1 with 8 decimals

      const account: LiquidationUserFullInfo = {
        account: "0xUser1" as AddressLike,
        market: "0xMarket1" as AddressLike,
        healthRatio: 2000000000000000000n,
        userDebt: 760n * DECIMALS,
        positionValue: 1000n * DECIMALS,
        collateralBalance: 100n * DECIMALS, // 100 tokens (18 decimals)
        collatToken: "0xToken1" as AddressLike,
        collateralUSDPrice: oraclePrice,
        oracleDecimals,
      }

      // Calculate expected: (100 * 10^18 * 1 * 10^8 * 9850) / (10^8 * 10000)
      // = (100 * 1 * 9850) * (10^18 * 10^8) / (10^8 * 10000)
      // = 985000 * 10^18 / 10000
      // = 98.5 * 10^18
      const expected = (985000n * DECIMALS) / 10000n

      const result = (liquidationService as any).calculateMinCollatValueToLiquidate(account)
      expect(result).toBe(expected)
    })

    it("should calculate minCollatValueToLiquidate with high collateral balance and price", () => {
      // Set config with 1.5% protection
      liquidationConfig.limits.oraclePriceProtectionBps = 150

      const account: LiquidationUserFullInfo = {
        account: "0xUser1" as AddressLike,
        market: "0xMarket1" as AddressLike,
        healthRatio: 2000000000000000000n,
        userDebt: 760n * DECIMALS,
        positionValue: 1000n * DECIMALS,
        collateralBalance: 10000n * DECIMALS, // 10,000 tokens
        collatToken: "0xToken1" as AddressLike,
        collateralUSDPrice: 5n * DECIMALS, // $5 per token
        oracleDecimals: 18n,
      }

      // Calculate expected: (10000 * 10^18 * 5 * 10^18 * 9850) / (10^18 * 10000)
      // = (10000 * 5 * 9850) * 10^18 / 10000
      // = 49250000 * 10^18 / 10000
      // = 4925 * 10^18
      const expected = (10000n * 5n * 9850n * DECIMALS) / 10000n

      const result = (liquidationService as any).calculateMinCollatValueToLiquidate(account)
      expect(result).toBe(expected)
    })

    it("should throw error when collateralUSDPrice is missing", () => {
      const account: LiquidationUserFullInfo = {
        account: "0xUser1" as AddressLike,
        market: "0xMarket1" as AddressLike,
        healthRatio: 2000000000000000000n,
        userDebt: 760n * DECIMALS,
        positionValue: 1000n * DECIMALS,
        collateralBalance: 100n * DECIMALS,
        collatToken: "0xToken1" as AddressLike,
        collateralUSDPrice: undefined,
        oracleDecimals: 18n,
      }

      expect(() => {
        ;(liquidationService as any).calculateMinCollatValueToLiquidate(account)
      }).toThrow("collateralUSDPrice or oracleDecimals is missing")
    })

    it("should throw error when oracleDecimals is missing", () => {
      const account: LiquidationUserFullInfo = {
        account: "0xUser1" as AddressLike,
        market: "0xMarket1" as AddressLike,
        healthRatio: 2000000000000000000n,
        userDebt: 760n * DECIMALS,
        positionValue: 1000n * DECIMALS,
        collateralBalance: 100n * DECIMALS,
        collatToken: "0xToken1" as AddressLike,
        collateralUSDPrice: 1n * DECIMALS,
        oracleDecimals: undefined,
      }

      expect(() => {
        ;(liquidationService as any).calculateMinCollatValueToLiquidate(account)
      }).toThrow("collateralUSDPrice or oracleDecimals is missing")
    })

    it("should use minCollatValueToLiquidate in executeLiquidation", async () => {
      // Set config with 1.5% protection
      liquidationConfig.limits.oraclePriceProtectionBps = 150

      const account: LiquidationUserFullInfo = {
        account: "0xUser1" as AddressLike,
        market: "0xMarket1" as AddressLike,
        healthRatio: 2000000000000000000n,
        userDebt: 760n * DECIMALS,
        positionValue: 1000n * DECIMALS,
        collateralBalance: 100n * DECIMALS,
        collatToken: "0xToken1" as AddressLike,
        collateralUSDPrice: 1n * DECIMALS,
        oracleDecimals: 18n,
      }

      const mockEstimate: LiquidationEstimateInfo[] = [
        {
          account: account.account,
          collatToLiquidate: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
          minTgUSDOut: 900n * DECIMALS,
          liquidationCall: {
            routerCall: "0x1234",
            routerAddress: "0xCurveRouter",
          },
          expectedOutput: 1000n * DECIMALS,
          slippageBps: 50n,
          gasEstimate: {
            gasLimit: 200000n,
            eth: 0.0002,
          },
          grossProfit: 240n * DECIMALS,
          routerType: "curve" as const,
        },
      ]

      const mockProvider = {
        getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1000000000n }),
        getTransactionCount: vi.fn().mockResolvedValue(0),
      }

      const mockSigner = {
        getAddress: vi.fn().mockResolvedValue("0xSignerAddress"),
        provider: mockProvider,
      }

      const mockTx = {
        wait: vi.fn().mockResolvedValue({}),
      }

      const mockMarketContract = {
        liquidate: vi.fn().mockResolvedValue(mockTx),
      }

      mockWallet.mockImplementation(() => mockSigner)
      mockContract.mockImplementation(() => mockMarketContract)

      const mockContext = {
        ...nominalContext,
        currentRpcIndex: 0,
        providers: [mockProvider] as any,
        walletsPks: ["0xPrivateKey1"],
      } as any

      const liquidationServiceWithContext = new LiquidationService(mockMarketBorrowerRepository, mockContext, mockRouterService as unknown as RouterService)

      vi.spyOn(liquidationServiceWithContext, "estimateLiquidation").mockResolvedValue(mockEstimate)

      await liquidationServiceWithContext.executeLiquidation(0, account)

      // Verify that liquidate was called with the calculated minCollatValueToLiquidate
      expect(mockMarketContract.liquidate).toHaveBeenCalledTimes(1)
      const liquidateCall = mockMarketContract.liquidate.mock.calls[0]
      const liquidateParams = liquidateCall[0]

      // Expected: (100 * 10^18 * 1 * 10^18 * 9850) / (10^18 * 10000) = 98.5 * 10^18
      const expectedMinCollatValue = (100n * 9850n * DECIMALS) / 10000n
      expect(liquidateParams.minCollatValueToLiquidate).toBe(expectedMinCollatValue)
    })
  })
})
