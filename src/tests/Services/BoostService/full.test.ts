import { beforeEach, describe, expect, it, vi, assert } from "vitest"
import { UserPointsRepository } from "db/UserPointsRepository"
import { TRANSFER } from "../../../resources/eventSignatures"
import { JsonRpcProvider, parseEther } from "ethers"
import { BoostService } from "services/boost/BoostService"
import { BoostRepository } from "db/BoostRepository"

// --------------------------------------------
// updateTasks()
// --------------------------------------------

describe.only("UserPointsService.updateBoosts", () => {
  let boostService: BoostService
  let provider: JsonRpcProvider
  let deleteUserBoostsSpy: ReturnType<typeof vi.spyOn>
  let insertUserBoostsSpy: ReturnType<typeof vi.spyOn>
  let getLastBoostsSpy: ReturnType<typeof vi.spyOn>

  const boostRepository = {
    getLastBoosts: vi.fn(),
    deleteUserBoosts: vi.fn(),
    insertUserBoosts: vi.fn(),
  } as any as BoostRepository

  beforeEach(() => {
    vi.clearAllMocks()
    provider = {} as JsonRpcProvider

    boostService = new BoostService(provider, boostRepository)
    deleteUserBoostsSpy = vi.spyOn(boostRepository as any, "deleteUserBoosts").mockResolvedValue(undefined as any)
    insertUserBoostsSpy = vi.spyOn(boostRepository as any, "insertUserBoosts")
    getLastBoostsSpy = vi.spyOn(boostRepository as any, "getLastBoosts")
  })

  it("Should compute and insert properly new boosts", async () => {
    vi.spyOn(boostService, "getOnchainBalancesSnapshot").mockResolvedValue({
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
    })
    getLastBoostsSpy.mockResolvedValue([])

    await boostService.updateBoosts(["uA", "uB", "uC", "uD", "uE"])

    expect(insertUserBoostsSpy).toBeCalledWith([
      {
        user_address: "uA",
        start_at: new Date(100 * 1000),
        multiplier: 1.75,
      },
      {
        user_address: "uE",
        start_at: new Date(100 * 1000),
        multiplier: 1.5,
      },
    ])

    expect(deleteUserBoostsSpy).not.toBeCalled()
  })

  it("Should compute and update new boosts", async () => {
    vi.spyOn(boostService, "getOnchainBalancesSnapshot").mockResolvedValue({
      timestamp: 120n,
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
    })
    // Retrieve last existing boosts
    getLastBoostsSpy.mockResolvedValue([
      {
        id: 1,
        user_address: "uA",
        multiplier: 1.5,
        start_at: new Date(100 * 1000),
        end_at: null,
      },
      {
        id: 2,
        user_address: "uB",
        multiplier: 1.25,
        start_at: new Date(100 * 1000),
        end_at: null,
      },
    ])

    await boostService.updateBoosts(["uA", "uB", "uC", "uD", "uE"])

    expect(insertUserBoostsSpy).toBeCalledWith([
      {
        id: 1,
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
        multiplier: 1.5,
        start_at: new Date(120 * 1000),
      },

      { id: 2, user_address: "uB", multiplier: 1.25, start_at: new Date(100 * 1000), end_at: new Date(120 * 1000) },
    ])

    expect(deleteUserBoostsSpy).toBeCalledWith([1, 2])
  })
})
