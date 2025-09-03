import { assert, beforeEach, describe, expect, it, vi } from "vitest"
import { UserPointsRepository } from "db/UserPointsRepository"
import { TRANSFER } from "../../../resources/eventSignatures"
import { JsonRpcProvider, parseEther } from "ethers"
import { BoostService } from "services/boost/BoostService"

// --------------------------------------------
// updateTasks()
// --------------------------------------------

describe.only("UserPointsService merging functions", () => {
  let boostService: BoostService
  let provider: JsonRpcProvider

  const userPointsRepository = {
    getLastBoosts: vi.fn(),
    deleteUserBoosts: vi.fn(),
    insertUserBoosts: vi.fn(),
  } as any as UserPointsRepository

  beforeEach(() => {
    vi.clearAllMocks()
    provider = {} as JsonRpcProvider

    boostService = new BoostService(provider, userPointsRepository)
  })

  //   it("Should close boost on users", async () => {
  //     const date1 = new Date()
  //     const date2 = new Date(date1)
  //     date2.setDate(date1.getDate() + 2)
  //     const { toDelete, toInsert } = boostService.createRowsToDeleteAndInsert(
  //       [
  //         {
  //           id: 1n,
  //           user_address: "uA",
  //           start_at: date1,
  //           multiplier: 1.75,
  //         },
  //         {
  //           id: 2n,
  //           user_address: "uE",
  //           start_at: date1,
  //           multiplier: 1.5,
  //         },
  //       ],
  //       {},
  //       date2
  //     )

  //     assert.deepEqual(toDelete, [1n, 2n])
  //     assert.deepEqual(toInsert, [
  //       {
  //         id: 1n,
  //         user_address: "uA",
  //         start_at: date1,
  //         end_at: date2,
  //         multiplier: 1.75,
  //       },
  //       {
  //         id: 2n,
  //         user_address: "uE",
  //         start_at: date1,
  //         end_at: date2,
  //         multiplier: 1.5,
  //       },
  //     ])
  //   })

  it.only("Should sort properly lines to delete and insert in user_boosts", async () => {
    const date0 = new Date()
    const date1 = new Date()
    const date2 = new Date(date1)

    date0.setDate(date1.getDate() - 2)
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
      { uB: 2, uC: 3, uE: 1.25, uA: 1.75 },
      date2
    )

    assert.deepEqual(toDelete, [2n])
    assert.deepEqual(toInsert, [
      {
        user_address: "uB",
        start_at: date2,
        multiplier: 2,
      },
      {
        user_address: "uC",
        start_at: date2,
        multiplier: 3,
      },
      {
        id: 2n,
        user_address: "uE",
        start_at: date1,
        end_at: date2,
        multiplier: 1.5,
      },
      {
        user_address: "uE",
        start_at: date2,
        multiplier: 1.25,
      },
    ])
  })

  it("Verify the merging of onchain and offchain boost", async () => {
    const newBoosts = boostService.mergeOffChainAndOnChainBoosts({ uA: 4, uB: 2 }, { uA: 2.75, uB: 1.75, uC: 2, uD: 500 })

    assert.deepEqual(newBoosts, { uA: 4, uB: 3.75, uC: 2, uD: 4 })
  })
})
