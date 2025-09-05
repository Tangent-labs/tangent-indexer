import { beforeEach, describe, expect, it, vi } from "vitest"
import { JsonRpcProvider, parseEther } from "ethers"
import { BoostService } from "services/boost/BoostService"
import { BoostRepository } from "db/BoostRepository"

describe("UserPointsService.updateBoosts", () => {
  let boostService: BoostService
  let provider: JsonRpcProvider
  let getBoostSubscribersSpy: ReturnType<typeof vi.spyOn>
  let getActiveBoostsSpy: ReturnType<typeof vi.spyOn>
  let getOffChainBoostUsersSpy: ReturnType<typeof vi.spyOn>
  let deleteUserBoostsSpy: ReturnType<typeof vi.spyOn>
  let insertUserBoostsSpy: ReturnType<typeof vi.spyOn>

  let onChainSnapshot = {
    timestamp: 100n,
    snapshot: [
      {
        user: "uA",
        tokenBalance: [
          { token: "0xe127cE638293FA123Be79C25782a5652581Db234", balance: "1" },
          { token: "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2", balance: "150" },
          { token: "0x22222222E9fE38F6f1FC8C61b25228adB4D8B953", balance: parseEther("2500").toString() },
        ],
      },

      {
        user: "uE",
        tokenBalance: [
          { token: "0x0C30476f66034E11782938DF8e4384970B6c9e8a", balance: parseEther("2500").toString() },
          { token: "0xfe4bce4b3949c35fb17691d8b03c3cadbe2e5e23", balance: parseEther("9999").toString() },
          { token: "0x90c1f9220d90d3966FbeE24045EDd73E1d588aD5", balance: parseEther("25").toString() },
        ],
      },
    ],
  }

  const boostRepository = {
    getBoostSubscribers: vi.fn(),
    getActiveBoosts: vi.fn(),
    getOffChainBoostUsers: vi.fn(),
    deleteUserBoosts: vi.fn(),
    insertUserBoosts: vi.fn(),
  } as any as BoostRepository

  beforeEach(() => {
    vi.clearAllMocks()
    provider = {} as JsonRpcProvider

    boostService = new BoostService(provider, boostRepository)
    getBoostSubscribersSpy = vi.spyOn(boostRepository as any, "getBoostSubscribers")
    getActiveBoostsSpy = vi.spyOn(boostRepository as any, "getActiveBoosts")
    getOffChainBoostUsersSpy = vi.spyOn(boostRepository as any, "getOffChainBoostUsers")
    deleteUserBoostsSpy = vi.spyOn(boostRepository as any, "deleteUserBoosts")
    insertUserBoostsSpy = vi.spyOn(boostRepository as any, "insertUserBoosts")
  })

  it("Should compute and insert properly new boosts", async () => {
    getBoostSubscribersSpy.mockResolvedValue([
      { user_address: "uA" },
      { user_address: "uB" },
      { user_address: "uC" },
      { user_address: "uD" },
      { user_address: "uE" },
    ])
    vi.spyOn(boostService, "getOnchainBalancesSnapshot").mockResolvedValue(onChainSnapshot)

    getActiveBoostsSpy.mockResolvedValue([])

    // Retrieve last existing boosts
    getOffChainBoostUsersSpy.mockResolvedValue([
      {
        id: 1n,
        user_address: "uE",
        type: "CVG_PEPE",
      },
      {
        id: 2n,
        user_address: "uY",
        type: "LP_DEALS",
      },
    ])

    await boostService.updateBoosts()

    expect(insertUserBoostsSpy).toBeCalledWith([
      {
        user_address: "uA",
        start_at: new Date(100 * 1000),
        multiplier: 1.75,
      },
      {
        user_address: "uE",
        start_at: new Date(100 * 1000),
        multiplier: 2.25,
      },
      {
        user_address: "uY",
        start_at: new Date(100 * 1000),
        multiplier: 2,
      },
    ])

    expect(deleteUserBoostsSpy).not.toBeCalled()
  })

  it("Should compute and update new boosts", async () => {
    onChainSnapshot.timestamp = 120n

    vi.spyOn(boostService, "getOnchainBalancesSnapshot").mockResolvedValue(onChainSnapshot)
    // Retrieve last existing boosts
    getActiveBoostsSpy.mockResolvedValue([
      {
        id: 1n,
        user_address: "uA",
        multiplier: 1.5,
        start_at: new Date(100 * 1000),
        end_at: null,
      },
      {
        id: 2n,
        user_address: "uB",
        multiplier: 1.25,
        start_at: new Date(100 * 1000),
        end_at: null,
      },
    ])

    await boostService.updateBoosts()

    // Retrieve last existing boosts
    getOffChainBoostUsersSpy.mockResolvedValue([
      {
        id: 1n,
        user_address: "uE",
        type: "CVG_PEPE",
      },
      {
        id: 2n,
        user_address: "uY",
        type: "LP_DEALS",
      },
    ])

    expect(insertUserBoostsSpy).toBeCalledWith([
      {
        id: 1n,
        user_address: "uA",
        multiplier: 1.5,
        start_at: new Date(100 * 1000),
        end_at: new Date(120 * 1000),
      },

      {
        user_address: "uA",
        multiplier: 1.75,
        start_at: new Date(120 * 1000),
      },

      {
        user_address: "uE",
        multiplier: 2.25,
        start_at: new Date(120 * 1000),
      },

      {
        user_address: "uY",
        multiplier: 2,
        start_at: new Date(120 * 1000),
      },
      {
        id: 2n,
        user_address: "uB",
        multiplier: 1.25,
        start_at: new Date(100 * 1000),
        end_at: new Date(120 * 1000),
      },
    ])

    expect(deleteUserBoostsSpy).toBeCalledWith([1n, 2n])
  })
})
