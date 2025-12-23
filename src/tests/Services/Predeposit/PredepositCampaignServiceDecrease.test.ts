import { beforeEach, describe, expect, it, vi } from "vitest"

import { PredepositCampaignRepository } from "src/db/PredepositCampaignRepository.js"
import { BlockRepository } from "src/db/BlockRepository.js"
import { PredepositCampaignService } from "src/services/PredepositCampaignService.js"
import { parseEther, JsonRpcProvider } from "ethers"

import * as chainModule from "../../../utils/chainView.js"

describe("PredepositCampaignServiceDecrease - Decrease amounts part", () => {
  vi.mock("../../../utils/chainView.js", () => ({
    chainView: vi.fn(),
  }))
  const predepositCampaignRepository = {
    getLastPredepositCampaignBlock: vi.fn(),
    getAllAccountedBalances: vi.fn(),
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

  const FIVE_M = parseEther("5000000").toString()
  const ONE_500_M = parseEther("1500000").toString()
  const aDate = new Date()
  const PUBLIC_USERS = [{ user_address: "USER0" }, { user_address: "USER1" }, { user_address: "USER2" }]

  const totalUSG_USDC = { id: 1n, cap_lp: FIVE_M, total_lp: parseEther("4000000").toString(), usg_lp_id: 1n, usg_lp: { lp_name: "USG-USDC" } }
  const totalUSG_frxUSD = { id: 2n, cap_lp: ONE_500_M, total_lp: ONE_500_M, usg_lp_id: 2n, usg_lp: { lp_name: "USG-frxUSD" } }

  vi.spyOn(predepositCampaignRepository, "getAllUsers").mockResolvedValue(PUBLIC_USERS)
  vi.spyOn(predepositCampaignRepository, "getAllAccountedBalances").mockResolvedValue([
    { id: 1n, user_address: "USER0", usg_lp: { lp_name: "USG-USDC" }, balance_lp: parseEther("3000000").toString(), usg_lp_id: 1n },
    { id: 2n, user_address: "USER0", usg_lp: { lp_name: "USG-frxUSD" }, balance_lp: parseEther("1000000").toString(), usg_lp_id: 2n },
    { id: 3n, user_address: "USER2", usg_lp: { lp_name: "USG-USDC" }, balance_lp: parseEther("1500000").toString(), usg_lp_id: 1n },
    { id: 4n, user_address: "USER1", usg_lp: { lp_name: "USG-frxUSD" }, balance_lp: parseEther("500000").toString(), usg_lp_id: 2n },
  ])
  vi.spyOn(predepositCampaignRepository, "getAccountedTotal").mockResolvedValue([totalUSG_USDC, totalUSG_frxUSD])

  const blockRepository = {
    getLastEventBlock: vi.fn(),
  } as any as BlockRepository

  const provider = {} as any as JsonRpcProvider

  const predepositService = new PredepositCampaignService(predepositCampaignRepository, blockRepository, provider)
  vi.spyOn(predepositService as any, "getAccountedUsers")
  vi.spyOn(predepositService as any, "updateDbState")
  vi.spyOn(predepositService as any, "getOnchainSnapshot")

  // Mock .env
  vi.stubEnv("INDEXING_BLOCK_RANGE", "100")
  vi.stubEnv("STARTING_BLOCK", "100")

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()
  })

  it("Test when the getLastPredepositCampaignBlock is undefined", async () => {
    ;(chainModule.chainView as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      [
        [parseEther("5000000"), 0n, parseEther("1000000")],
        [parseEther("1000000"), parseEther("500000"), 0n],
      ],
    ])

    await predepositService.decreaseAccountedAmounts(false, aDate)

    expect((predepositService as any).updateDbState).toHaveBeenCalledWith(
      [1n],
      [{ id: 1n, usg_lp_id: 1n, cap_lp: FIVE_M, total_lp: parseEther("3500000").toString() }],
      [3n],
      [{ id: 3n, usg_lp_id: 1n, user_address: "USER2", balance_lp: parseEther("1000000").toString() }],
      aDate
    )
  })
})
