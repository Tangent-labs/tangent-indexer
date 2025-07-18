import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "fs"

import { LiquidationService } from "../../../src/services/LiquidationService"
import { ActiveBorrowersRepository } from "../../../src/db/ActiveBorrowersRepository"
import { AddressLike, JsonRpcProvider } from "ethers"
import {
  LiquidationAccountOutInfo,
  LiquidationMarketAccountOutInfo,
  LiquidationMarketOutInfo,
  LiquidationUserInfo,
  LiquidationUserInInfo,
  LiquidationUserFullInfo,
} from "../../../src/type/data"
import { BlockRepository } from "../../../src/db/BlockRepository"

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

  beforeEach(() => {
    marketBorrowerRepository = new ActiveBorrowersRepository({} as any) // Mock Prisma client
    liquidationService = new LiquidationService(marketBorrowerRepository, nominalContext)

    // Mock BlockRepository
    mockBlockRepository = {
      getLastBlockIndexed: vi.fn(),
      setClient: vi.fn(),
    }
    vi.spyOn(BlockRepository.prototype, "getLastBlockIndexed").mockImplementation(mockBlockRepository.getLastBlockIndexed)
    vi.spyOn(BlockRepository.prototype, "setClient").mockImplementation(mockBlockRepository.setClient)
  })

  describe("checkContext", () => {
    it("should handle RPC errors and select the working RPC with highest block", async () => {
      // Mock providers with different block numbers and one failing RPC
      liquidationService.context.providers = [
        { getBlockNumber: vi.fn().mockRejectedValue(new Error("RPC 1 failed")) },
        { getBlockNumber: vi.fn().mockResolvedValue(1000) },
        { getBlockNumber: vi.fn().mockResolvedValue(2000) },
      ] as unknown as JsonRpcProvider[]

      await liquidationService.checkContext()

      // Verify context was updated correctly
      expect(liquidationService.context.currentRpcIndex).toBe(2) // Should select the RPC with block 2000
      expect(liquidationService.context.currentBlock).toBe(2000)
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
      liquidationService.context.providers = [{ getBlockNumber: vi.fn().mockResolvedValue(1000) }] as unknown as JsonRpcProvider[]

      // Test when database check fails
      mockBlockRepository.getLastBlockIndexed.mockRejectedValueOnce(new Error("DB connection failed"))
      await liquidationService.checkContext()
      expect(liquidationService.context.isDbAlive).toBe(true)

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

    liquidationService = new LiquidationService(mockMarketBorrowerRepository as any as ActiveBorrowersRepository, nominalContext)

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
    liquidationService = new LiquidationService(mockMarketBorrowerRepository as any as ActiveBorrowersRepository, context)

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
    liquidationService = new LiquidationService(mockMarketBorrowerRepository as any as ActiveBorrowersRepository, context)

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

  beforeEach(() => {
    // Mock repository
    mockMarketBorrowerRepository = {
      getAll: vi.fn(),
      deleteMarketBorrowers: vi.fn(),
    } as unknown as ActiveBorrowersRepository

    // Create service instance
    liquidationService = new LiquidationService(mockMarketBorrowerRepository, nominalContext)
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
    }

    const result = await liquidationService.analyzeLiquidation(liquidationData, accounts)

    expect(result.seizingList).toHaveLength(0)
    expect(result.liquidationList).toHaveLength(0)
    expect(result.notDebtorAnymoreList).toHaveLength(1)
    expect(result.notDebtorAnymoreList?.[0].account).toBe("0xUser1")
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
    }

    const result = await liquidationService.analyzeLiquidation(liquidationData, accounts)

    expect(result.seizingList).toHaveLength(0)
    expect(result.liquidationList).toHaveLength(0)
    expect(result.notDebtorAnymoreList).toHaveLength(0)
  })

  it("should correctly classify and sort  a mix of hard liquidations, soft liquidations, and non-debtors", async () => {
    const accounts: LiquidationUserInInfo[] = [
      { account: "0xUser1", market: "0xMarket1" }, // Hard Liquidation
      { account: "0xUser2", market: "0xMarket2" }, // Soft Liquidation
      { account: "0xUser3", market: "0xMarket3" }, // Not a debtor (zero debt)
      { account: "0xUser4", market: "0xMarket4" }, // Healthy account (no liquidation)
      { account: "0xUser5", market: "0xMarket5" }, // Soft Liquidation
      { account: "0xUser6", market: "0xMarket6" }, // Hard Liquidation
    ]

    const defaultMarket: LiquidationMarketOutInfo = {
      liquidationThreshold: 90000n,
      ...baseMarketValues,
      market: "0xMarket1",
      collatToken: "0x0000000000000000000000000000000000000000" as AddressLike,
    }
    const liquidationData: LiquidationMarketAccountOutInfo = {
      markets: [
        { ...defaultMarket, market: "0xMarket1" },
        { ...baseMarketValues, market: "0xMarket2", liquidationThreshold: 75000n },
        { ...defaultMarket, market: "0xMarket3" },
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
          healthRatio: 2000000000000000000n, // No debt 0xUser3
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
    }

    const result = await liquidationService.analyzeLiquidation(liquidationData, accounts)

    // Expectations
    expect(result.seizingList).toHaveLength(2)
    expect(result.seizingList?.[0].account).toBe("0xUser6")
    expect(result.seizingList?.[1].account).toBe("0xUser1")

    expect(result.liquidationList).toHaveLength(2)
    expect(result.liquidationList?.[0].account).toBe("0xUser5")
    expect(result.liquidationList?.[1].account).toBe("0xUser2")

    expect(result.notDebtorAnymoreList).toHaveLength(1)
    expect(result.notDebtorAnymoreList?.[0].account).toBe("0xUser3")

    expect(result.seizingList?.some((acc: LiquidationUserInfo) => acc.account === "0xUser2")).toBe(false)
    expect(result.liquidationList?.some((acc: LiquidationUserInfo) => acc.account === "0xUser1")).toBe(false)
    expect(result.notDebtorAnymoreList?.some((acc: LiquidationUserInInfo) => acc.account === "0xUser4")).toBe(false)
  })
})

describe("LiquidationService - prioritizeActions", () => {
  let liquidationService: LiquidationService
  let mockMarketBorrowerRepository: ActiveBorrowersRepository

  beforeEach(() => {
    mockMarketBorrowerRepository = new ActiveBorrowersRepository({} as any)
    liquidationService = new LiquidationService(mockMarketBorrowerRepository, nominalContext)
  })

  it("should prioritize actions based on position value and wallet count", () => {
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

    // Verify the result
    expect(result).toHaveLength(2) // Limited by wallet count
    expect(result[0].type).toBe("seizing")
    expect(result[0].account).toBe("0xUser1") // Highest position value
    expect(result[1].type).toBe("seizing")
    expect(result[1].account).toBe("0xUser2") // Second highest position value
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

  it("should handle more input liquidations than available wallets", () => {
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

    // Verify the result
    expect(result).toHaveLength(2) // Limited by wallet count
    expect(result[0].type).toBe("seizing")
    expect(result[0].account).toBe("0xUser1") // Highest position value
    expect(result[1].type).toBe("liquidation")
    expect(result[1].account).toBe("0xUser2") // Second highest position value

    // Verify that lower value positions were not included
    expect(result.some((r) => r.account === "0xUser3")).toBe(false)
    expect(result.some((r) => r.account === "0xUser4")).toBe(false)
    expect(result.some((r) => r.account === "0xUser5")).toBe(false)
  })
})
