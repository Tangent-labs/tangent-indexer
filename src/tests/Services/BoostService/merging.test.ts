import { assert, beforeEach, describe, it, vi } from "vitest"
import { JsonRpcProvider } from "ethers"
import { BoostService } from "../../../services/boost/BoostService.js"
import { BoostRepository } from "../../../db/Points/BoostRepository.js"

// --------------------------------------------
// updateTasks()
// --------------------------------------------

describe("UserPointsService merging functions", () => {
  let boostService: BoostService
  let provider: JsonRpcProvider

  const boostRepository = {
    getLastBoosts: vi.fn(),
    deleteUserBoosts: vi.fn(),
    insertUserBoosts: vi.fn(),
  } as any as BoostRepository

  beforeEach(() => {
    vi.clearAllMocks()
    provider = {} as JsonRpcProvider

    boostService = new BoostService(provider, boostRepository)
  })

  it("Should close boost on users", async () => {
    const date1 = new Date()
    const date2 = new Date(date1)
    date2.setDate(date1.getDate() + 2)
    const { toDelete, toInsert } = boostService.createRowsToDeleteAndInsert(
      [
        {
          id: 1n,
          user_address: "uA",
          start_at: date1,
          multiplier: 1.75,
        },
        {
          id: 2n,
          user_address: "uE",
          start_at: date1,
          multiplier: 1.5,
        },
      ],
      {},
      date2
    )

    assert.deepEqual(toDelete, [1n, 2n])
    assert.deepEqual(toInsert, [
      {
        id: 1n,
        user_address: "uA",
        start_at: date1,
        end_at: date2,
        multiplier: 1.75,
      },
      {
        id: 2n,
        user_address: "uE",
        start_at: date1,
        end_at: date2,
        multiplier: 1.5,
      },
    ])
  })

  it("Should sort properly lines to delete and insert in user_boosts", async () => {
    const date0 = new Date()
    const date1 = new Date()
    const date2 = new Date(date1)

    date0.setDate(date1.getDate() - 2)
    date2.setDate(date1.getDate() + 2)
    const { toDelete, toInsert } = boostService.createRowsToDeleteAndInsert(
      [
        {
          id: 1n,
          user_address: "ua",
          start_at: date1,
          multiplier: 1.75,
        },
        {
          id: 2n,
          user_address: "ue",
          start_at: date1,
          multiplier: 1.5,
        },
      ],
      { ub: 2, uc: 3, ue: 1.25, ua: 1.75 },
      date2
    )

    assert.deepEqual(toDelete, [2n])
    assert.deepEqual(toInsert, [
      {
        user_address: "ub",
        start_at: date2,
        multiplier: 2,
      },
      {
        user_address: "uc",
        start_at: date2,
        multiplier: 3,
      },
      {
        id: 2n,
        user_address: "ue",
        start_at: date1,
        end_at: date2,
        multiplier: 1.5,
      },
      {
        user_address: "ue",
        start_at: date2,
        multiplier: 1.25,
      },
    ])
  })

  it("Verify the merging of onchain and offchain boost", async () => {
    const newBoosts = boostService.mergeOffChainAndOnChainBoosts({ uA: 4, uB: 2, uE: 1.5 }, { uA: 2.75, uB: 1.75, uC: 2, uD: 500 })

    assert.deepEqual(newBoosts, { ua: 4, ub: 4, uc: 3, ud: 4, ue: 2.5 })
  })
})
