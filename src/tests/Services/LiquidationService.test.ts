import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "fs"

import { LiquidationService } from "../../../src/services/LiquidationService"
import { MarketBorrowerRepository } from "../../../src/db/MarketBorrowerRepository"
import { AddressLike } from "ethers"
import {
  LiquidationAccountOutInfo,
  LiquidationMarketAccountOutInfo,
  LiquidationMarketOutInfo,
  LiquidationUserInfo,
  LiquidationUserInInfo,
} from "../../../src/type/data"

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
}

describe("LiquidationService", () => {
  let liquidationService: LiquidationService
  let marketBorrowerRepository: MarketBorrowerRepository

  beforeEach(() => {
    marketBorrowerRepository = new MarketBorrowerRepository({} as any) // Mock Prisma client
    liquidationService = new LiquidationService(marketBorrowerRepository, nominalContext)
  })

  it("should get liquidation parameters", async () => {
    const mockBorrowers = [
      {
        borrower_address: "0x123" as AddressLike,
        contract_address: "0x456" as AddressLike,
      },
      {
        borrower_address: "0x789" as AddressLike,
        contract_address: "0xABC" as AddressLike,
      },
      {
        borrower_address: "0x789" as AddressLike,
        contract_address: "0x456" as AddressLike,
      },
    ] as any

    const mockMarketBorrowerRepository = {
      getList: vi.fn().mockResolvedValue(mockBorrowers),
    }

    liquidationService = new LiquidationService(mockMarketBorrowerRepository as any as MarketBorrowerRepository, nominalContext)

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
    const mockBorrowers = [
      {
        borrower_address: "0x123" as AddressLike,
        contract_address: "0x456" as AddressLike,
      },
    ] as any

    const mockMarketBorrowerRepository = {
      getList: vi.fn().mockResolvedValue(mockBorrowers),
    }

    const context = { ...nominalContext, isDbAlive: true }
    liquidationService = new LiquidationService(mockMarketBorrowerRepository as any as MarketBorrowerRepository, context)

    const { markets, borrowers } = await liquidationService.getLiquidationParams()

    expect(mockMarketBorrowerRepository.getList).toHaveBeenCalled()
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
      getList: vi.fn().mockResolvedValue(mockBorrowers),
    }

    const context = { ...nominalContext, isDbAlive: false }
    liquidationService = new LiquidationService(mockMarketBorrowerRepository as any as MarketBorrowerRepository, context)

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

    expect(mockMarketBorrowerRepository.getList).not.toHaveBeenCalled()
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
  let mockMarketBorrowerRepository: MarketBorrowerRepository

  beforeEach(() => {
    // Mock repository
    mockMarketBorrowerRepository = {
      getList: vi.fn(),
      deleteMarketBorrowers: vi.fn(),
    } as unknown as MarketBorrowerRepository

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
          positionDebt: 0n, // No debt
          positionValue: 500n * DECIMALS,
          market: "0xMarket1",
        },
      ] as LiquidationAccountOutInfo[],
    }

    const result = await liquidationService.analyzeLiquidation(liquidationData, accounts)

    expect(result.hardLiquidationList).toHaveLength(0)
    expect(result.softLiquidationList).toHaveLength(0)
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
          positionDebt: 200n * DECIMALS,
          positionValue: 1000n * DECIMALS,
          market: "0xMarket1",
        },
      ] as LiquidationAccountOutInfo[],
    }

    const result = await liquidationService.analyzeLiquidation(liquidationData, accounts)

    expect(result.hardLiquidationList).toHaveLength(0)
    expect(result.softLiquidationList).toHaveLength(0)
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
          positionDebt: 600n * DECIMALS,
          positionValue: 550n * DECIMALS,
          market: "0xMarket1",
        },
        {
          healthRatio: 2000000000000000000n, // (Soft Liquidation) 0xUser2
          positionDebt: 760n * DECIMALS,
          positionValue: 1000n * DECIMALS,
          market: "0xMarket2",
        },
        {
          healthRatio: 2000000000000000000n, // No debt 0xUser3
          positionDebt: 0n,
          positionValue: 500n * DECIMALS,
          market: "0xMarket3",
        },
        {
          healthRatio: 2500000000000000000n, // Nothing 0xUser4
          positionDebt: 500n * DECIMALS,
          positionValue: 2000n * DECIMALS,
          market: "0xMarket4",
        },
        {
          healthRatio: 2500000000000000000n, // (Soft Liquidation) 0xUser5
          positionDebt: 800n * DECIMALS,
          positionValue: 1050n * DECIMALS,
          market: "0xMarket5",
        },
        {
          healthRatio: 2500000000000000000n, // (Hard Liquidation) 0xUser6
          positionDebt: 620n * DECIMALS,
          positionValue: 560n * DECIMALS,
          market: "0xMarket6",
        },
      ] as LiquidationAccountOutInfo[],
    }

    const result = await liquidationService.analyzeLiquidation(liquidationData, accounts)

    // Expectations
    expect(result.hardLiquidationList).toHaveLength(2)
    expect(result.hardLiquidationList?.[0].account).toBe("0xUser6")
    expect(result.hardLiquidationList?.[1].account).toBe("0xUser1")

    expect(result.softLiquidationList).toHaveLength(2)
    expect(result.softLiquidationList?.[0].account).toBe("0xUser5")
    expect(result.softLiquidationList?.[1].account).toBe("0xUser2")

    expect(result.notDebtorAnymoreList).toHaveLength(1)
    expect(result.notDebtorAnymoreList?.[0].account).toBe("0xUser3")

    expect(result.hardLiquidationList?.some((acc: LiquidationUserInfo) => acc.account === "0xUser2")).toBe(false)
    expect(result.softLiquidationList?.some((acc: LiquidationUserInfo) => acc.account === "0xUser1")).toBe(false)
    expect(result.notDebtorAnymoreList?.some((acc: LiquidationUserInInfo) => acc.account === "0xUser4")).toBe(false)
  })
})
