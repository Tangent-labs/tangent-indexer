import { beforeEach, describe, expect, it, vi } from "vitest"

import { PredepositCampaignRepository } from "src/db/PredepositCampaignRepository.js"
import { BlockRepository } from "src/db/BlockRepository.js"
import { PredepositCampaignService } from "src/services/PredepositCampaignService.js"
import { parseEther, JsonRpcProvider } from "ethers"

describe("PredepositCampaignServiceIncrease - Increase amounts part", () => {
  let getBlockRangeSpy: ReturnType<typeof vi.spyOn>
  let getAccountedUsersSpy: ReturnType<typeof vi.spyOn>
  let getAndSortAddLiquidityEventsSpy: ReturnType<typeof vi.spyOn>
  let getComputeIncreaseAccountedBalancesSpy: ReturnType<typeof vi.spyOn>
  let updateDbStateSpy: ReturnType<typeof vi.spyOn>

  let getLastEventBlockSpy: ReturnType<typeof vi.spyOn>
  let getLastPredepositCampaignBlockSpy: ReturnType<typeof vi.spyOn>
  let getAccountedBalancesForUsersOnLPSpy

  let getPrivateUsersSpy: ReturnType<typeof vi.spyOn>
  let getAllUsersSpy: ReturnType<typeof vi.spyOn>
  let getAddLiquidityEventsInBlockRangeSpy
  let getAccountedTotalSpy: ReturnType<typeof vi.spyOn>

  const predepositCampaignRepository = {
    getLastPredepositCampaignBlock: vi.fn(),
    getPrivateUsers: vi.fn(),
    getAllUsers: vi.fn(),
    getAddLiquidityEventsInBlockRange: vi.fn(),
    getAccountedBalancesForUsersOnLP: vi.fn(),
    getAccountedTotal: vi.fn(),
    deleteAccountedTotal: vi.fn(),
    insertAccountedTotal: vi.fn(),
    deleteAccountedBalances: vi.fn(),
    insertAccountedBalances: vi.fn(),
    insertAccountedTotalHistory: vi.fn(),
    insertAccountedBalancesHistory: vi.fn(),
    storePredepositCampaignBlock: vi.fn(),
  } as any as PredepositCampaignRepository

  const blockRepository = {
    getLastEventBlock: vi.fn(),
  } as any as BlockRepository

  const provider = {} as any as JsonRpcProvider

  const predepositService = new PredepositCampaignService(predepositCampaignRepository, blockRepository, provider)
  getBlockRangeSpy = vi.spyOn(predepositService as any, "getBlockRange")
  getAccountedUsersSpy = vi.spyOn(predepositService as any, "getAccountedUsers")
  getAndSortAddLiquidityEventsSpy = vi.spyOn(predepositService as any, "getAndSortAddLiquidityEvents")
  getComputeIncreaseAccountedBalancesSpy = vi.spyOn(predepositService as any, "getComputeIncreaseAccountedBalances")
  updateDbStateSpy = vi.spyOn(predepositService as any, "updateDbState")

  vi.stubEnv("INDEXING_BLOCK_RANGE", "100")
  vi.stubEnv("STARTING_BLOCK", "100")

  const FIVE_M = parseEther("5000000").toString()
  const ONE_500_M = parseEther("1500000").toString()
  const aDate = new Date()
  const PRIVATE_USERS = [{ user_address: "USER0" }, { user_address: "USER1" }]
  const PUBLIC_USERS = [{ user_address: "USER0" }, { user_address: "USER1" }, { user_address: "USER2" }, { user_address: "USER3" }]
  const event1 = {
    id: 1n,
    block_id: 120,
    block_date: aDate,
    lp_amount: parseEther("500000").toString(),
    provider: "USER0",
    token0_amount: "1223343",
    token1_amount: "0",
    tx_hash: "Hash",
    usg_lp_id: 1n,
  }
  const event2 = {
    id: 2n,
    block_id: 125,
    block_date: aDate,
    lp_amount: parseEther("300000").toString(),
    provider: "USER0",
    token0_amount: "1223343",
    token1_amount: "0",
    tx_hash: "Hash",
    usg_lp_id: 1n,
  }
  const event3 = {
    id: 3n,
    block_id: 130,
    block_date: aDate,
    lp_amount: parseEther("200000").toString(),
    provider: "USER1",
    token0_amount: "1223343",
    token1_amount: "0",
    tx_hash: "Hash",
    usg_lp_id: 1n,
  }
  const event4 = {
    id: 4n,
    block_id: 135,
    block_date: aDate,
    lp_amount: parseEther("200000").toString(),
    provider: "USER0",
    token0_amount: "1223343",
    token1_amount: "0",
    tx_hash: "Hash",
    usg_lp_id: 2n,
  }
  const event5 = {
    id: 5n,
    block_id: 145,
    block_date: aDate,
    lp_amount: parseEther("2000000").toString(),
    provider: "USER1",
    token0_amount: "1223343",
    token1_amount: "0",
    tx_hash: "Hash",
    usg_lp_id: 2n,
  }

  const totalUSG_USDC = { id: 1n, cap_lp: FIVE_M, total_lp: parseEther("200000").toString(), usg_lp_id: 1n, usg_lp: { lp_name: "USG-USDC" } }
  const totalUSG_frxUSD = { id: 2n, cap_lp: ONE_500_M, total_lp: "0", usg_lp_id: 2n, usg_lp: { lp_name: "USG-frxUSD" } }

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()
  })

  it("Test when the getLastPredepositCampaignBlock is undefined", async () => {
    getLastPredepositCampaignBlockSpy = vi.spyOn(predepositCampaignRepository, "getLastPredepositCampaignBlock").mockResolvedValue({ block_id: 100n })
    getLastEventBlockSpy = vi.spyOn(blockRepository, "getLastEventBlock").mockResolvedValue({ block_id: 150n, created_at: aDate })
    getPrivateUsersSpy = vi.spyOn(predepositCampaignRepository, "getPrivateUsers").mockResolvedValue(PRIVATE_USERS)
    getAllUsersSpy = vi.spyOn(predepositCampaignRepository, "getAllUsers").mockResolvedValue(PUBLIC_USERS)

    getAddLiquidityEventsInBlockRangeSpy = vi
      .spyOn(predepositCampaignRepository, "getAddLiquidityEventsInBlockRange")
      .mockResolvedValue([event1, event2, event3, event4, event5])
    getAccountedBalancesForUsersOnLPSpy = vi
      .spyOn(predepositCampaignRepository, "getAccountedBalancesForUsersOnLP")
      .mockResolvedValueOnce([{ id: 1n, user_address: "USER0", balance_lp: parseEther("200000").toString(), usg_lp_id: 1n }])
      .mockResolvedValueOnce([])

    getAccountedTotalSpy = vi.spyOn(predepositCampaignRepository, "getAccountedTotal").mockResolvedValue([totalUSG_USDC, totalUSG_frxUSD])

    await predepositService.increaseAccountedAmounts(true, 100, aDate)

    // Assess that it passes by getBlockRange and returns good values
    expect((predepositService as any).getBlockRange).toHaveBeenCalledWith(100)
    expect((predepositService as any).getBlockRange).toHaveResolvedWith({ startBlock: 101, endBlock: 150 })

    // Assess that private users are returned and not all
    expect((predepositService as any).getAccountedUsers).toHaveBeenCalledWith(true)
    expect((predepositService as any).getAccountedUsers).toHaveResolvedWith(PRIVATE_USERS.map((u) => u.user_address))

    // Assess that private users are returned and not all
    expect((predepositService as any).getAndSortAddLiquidityEvents).toHaveBeenCalledWith(
      101,
      150,
      PRIVATE_USERS.map((u) => u.user_address)
    )
    expect((predepositService as any).getAndSortAddLiquidityEvents).toHaveResolvedWith(new Map())

    // Assess that private users are returned and not all
    const newObject = (({ usg_lp, ...rest }) => ({ ...rest, total_lp: parseEther("200000").toString() }))(totalUSG_USDC)

    expect((predepositService as any).getComputeIncreaseAccountedBalances).toHaveBeenCalledTimes(2)

    expect((predepositService as any).getComputeIncreaseAccountedBalances).toHaveBeenCalledWith(1, [event1, event2, event3], newObject)
    expect((predepositService as any).getComputeIncreaseAccountedBalances).toHaveResolvedWith({
      rowIdTotalToDelete: 1n,
      rowTotalToCreate: { ...newObject, total_lp: parseEther("1200000").toString() },
      rowsBalanceIdsToDelete: [1n],
      rowsBalancesToCreate: [
        {
          id: 1n,
          balance_lp: parseEther("1000000").toString(),
          user_address: "USER0",
          usg_lp_id: 1,
        },
        {
          balance_lp: parseEther("200000").toString(),
          user_address: "USER1",
          usg_lp_id: 1,
        },
      ],
    })

    const totalFrxUSD = (({ usg_lp, ...rest }) => ({ ...rest }))(totalUSG_frxUSD)

    expect((predepositService as any).getComputeIncreaseAccountedBalances).toHaveBeenNthCalledWith(2, 2, [event4, event5], totalFrxUSD)
    expect((predepositService as any).getComputeIncreaseAccountedBalances).toHaveNthResolvedWith(2, {
      rowIdTotalToDelete: 2n,
      rowTotalToCreate: { ...totalFrxUSD, total_lp: parseEther("1500000").toString() },
      rowsBalanceIdsToDelete: [],
      rowsBalancesToCreate: [
        {
          balance_lp: parseEther("200000").toString(),
          user_address: "USER0",
          usg_lp_id: 2,
        },
        {
          balance_lp: parseEther("1300000").toString(),
          user_address: "USER1",
          usg_lp_id: 2,
        },
      ],
    })

    expect((predepositService as any).updateDbState).toHaveBeenCalledWith(
      [1n, 2n],
      [
        { id: 1n, usg_lp_id: 1n, cap_lp: FIVE_M, total_lp: parseEther("1200000").toString() },
        { id: 2n, usg_lp_id: 2n, cap_lp: ONE_500_M, total_lp: parseEther("1500000").toString() },
      ],
      [1n],
      [
        { id: 1n, usg_lp_id: 1, user_address: "USER0", balance_lp: parseEther("1000000").toString() },
        { usg_lp_id: 1, user_address: "USER1", balance_lp: parseEther("200000").toString() },
        { usg_lp_id: 2, user_address: "USER0", balance_lp: parseEther("200000").toString() },
        { usg_lp_id: 2, user_address: "USER1", balance_lp: parseEther("1300000").toString() },
      ],
      aDate
    )
  })

  it("Test when there are no starting block in indexer-block", async () => {
    getLastPredepositCampaignBlockSpy = vi.spyOn(predepositCampaignRepository, "getLastPredepositCampaignBlock").mockResolvedValue(null)
    getLastEventBlockSpy = vi.spyOn(blockRepository, "getLastEventBlock").mockResolvedValue(null)

    await predepositService.increaseAccountedAmounts(false, 130, aDate)

    // Assess that it passes by getBlockRange and returns good values
    expect((predepositService as any).getBlockRange).toHaveBeenCalledWith(130)
    expect((predepositService as any).getBlockRange).toHaveResolvedWith({ startBlock: 0, endBlock: 0 })

    expect((predepositService as any).getAccountedUsers).not.toHaveBeenCalled()
  })

  it("Test when there are no starting block in indexer block", async () => {
    getLastPredepositCampaignBlockSpy = vi.spyOn(predepositCampaignRepository, "getLastPredepositCampaignBlock").mockResolvedValue({ block_id: 130n })
    getLastEventBlockSpy = vi.spyOn(blockRepository, "getLastEventBlock").mockResolvedValue({ block_id: 130n, created_at: aDate })

    await predepositService.increaseAccountedAmounts(false, 130, aDate)

    // Assess that it passes by getBlockRange and returns good values
    expect((predepositService as any).getBlockRange).toHaveBeenCalledWith(130)
    expect((predepositService as any).getBlockRange).toHaveResolvedWith({ startBlock: 131, endBlock: 130 })

    expect((predepositService as any).getAccountedUsers).not.toHaveBeenCalled()
  })
})
