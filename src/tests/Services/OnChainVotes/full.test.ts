import { beforeEach, describe, expect, it, vi } from "vitest"
import { JsonRpcProvider, parseEther } from "ethers"
import { BoostService } from "services/boost/BoostService"
import { BoostRepository } from "db/BoostRepository"
import { UserVoteRepository } from "db/UserVoteRepository"
import { votesFromDbPerTask } from "./mock"
import { OnChainVoteService } from "services/OnChainVoteService"

describe("UserPointsService.updateBoosts", () => {
  let onChainVoteService: OnChainVoteService
  let provider: JsonRpcProvider
  let getBoostSubscribersSpy: ReturnType<typeof vi.spyOn>
  let getActiveBoostsSpy: ReturnType<typeof vi.spyOn>
  let getOffChainBoostUsersSpy: ReturnType<typeof vi.spyOn>
  let deleteUserBoostsSpy: ReturnType<typeof vi.spyOn>
  let insertUserBoostsSpy: ReturnType<typeof vi.spyOn>
  let getGaugeVotersSpy: ReturnType<typeof vi.spyOn>

  const boostRepository = {
    getBoostSubscribers: vi.fn(),
    getActiveBoosts: vi.fn(),
    getOffChainBoostUsers: vi.fn(),
    deleteUserBoosts: vi.fn(),
    insertUserBoosts: vi.fn(),
  } as any as BoostRepository

  const userVoteRepository = {
    getGaugeVoters: vi.fn(),
  } as any as UserVoteRepository

  beforeEach(() => {
    vi.clearAllMocks()
    provider = {} as JsonRpcProvider

    onChainVoteService = new OnChainVoteService(userVoteRepository, boostRepository, provider)

    getBoostSubscribersSpy = vi.spyOn(boostRepository as any, "getBoostSubscribers")
    getActiveBoostsSpy = vi.spyOn(boostRepository as any, "getActiveBoosts")
    getOffChainBoostUsersSpy = vi.spyOn(boostRepository as any, "getOffChainBoostUsers")
    deleteUserBoostsSpy = vi.spyOn(boostRepository as any, "deleteUserBoosts")
    insertUserBoostsSpy = vi.spyOn(boostRepository as any, "insertUserBoosts")

    getGaugeVotersSpy = vi.spyOn(userVoteRepository as any, "getGaugeVoters")
  })

  it("Should compute and insert properly new boosts", async () => {
    getGaugeVotersSpy.mockResolvedValue(votesFromDbPerTask)
    vi.spyOn(onChainVoteService, "getOnchainData").mockResolvedValue({ timestamp: 100, gaugeControllerWeights: [{ gaugeController: "G" }] })

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
