import { beforeEach, describe, expect, it, vi } from "vitest"
import { JsonRpcProvider } from "ethers"
import { OnChainVoteService } from "../../../services/OnChainVoteService.js"
import { BoostRepository } from "../../../db/Points/BoostRepository.js"
import { UserPointsVoteRepository } from "../../../db/Points/UserPointsVoteRepository.js"
import { dateTimestamp, epochProposal, onChainSnapshot, USER_A, USER_B, votesFromDbPerTask } from "./mock.js"

describe("OnchainVoteService", () => {
  let onChainVoteService: OnChainVoteService
  let provider: JsonRpcProvider
  let getGaugeVotersSpy: ReturnType<typeof vi.spyOn>
  let getUsersBoostSpy: ReturnType<typeof vi.spyOn>

  let storeEpochProposalSpy: ReturnType<typeof vi.spyOn>
  let createUserVoteTasksSpy: ReturnType<typeof vi.spyOn>

  const boostRepository = {
    getUsersBoost: vi.fn(),
    deleteUserBoosts: vi.fn(),
    insertUserBoosts: vi.fn(),
  } as any as BoostRepository

  const userVoteRepository = {
    getGaugeVoters: vi.fn(),
    storeEpochProposal: vi.fn(),
    createUserVoteTasks: vi.fn(),
  } as any as UserPointsVoteRepository

  beforeEach(() => {
    vi.clearAllMocks()
    provider = {} as JsonRpcProvider

    onChainVoteService = new OnChainVoteService(userVoteRepository, boostRepository, provider)

    getUsersBoostSpy = vi.spyOn(boostRepository as any, "getUsersBoost")

    storeEpochProposalSpy = vi.spyOn(userVoteRepository as any, "storeEpochProposal")
    getGaugeVotersSpy = vi.spyOn(userVoteRepository as any, "getGaugeVoters")
    createUserVoteTasksSpy = vi.spyOn(userVoteRepository as any, "createUserVoteTasks")
  })

  it("Should compute and insert properly new boosts", async () => {
    // Mock the call to retrieve all voters per task ID to know what what to give to
    getGaugeVotersSpy.mockResolvedValue(votesFromDbPerTask)

    vi.spyOn(onChainVoteService, "getOnchainData").mockResolvedValue(onChainSnapshot)

    storeEpochProposalSpy.mockResolvedValue(epochProposal)
    // Mock boosts
    getUsersBoostSpy.mockResolvedValue([])
    await onChainVoteService.computeUserVoteTasks(provider)

    // Mock getGaugeVoters

    const date = new Date(Number(onChainSnapshot.timestamp) * 1000)

    // storeEpochProposal
    expect(storeEpochProposalSpy).toBeCalledWith([
      {
        epoch_id: "CONTROLLER_A " + dateTimestamp.toString(),
        epoch_name: "CONTROLLER_A " + dateTimestamp.toString(),
        gauge_controller_id: 1,
        processed_at: date,
      },
      {
        epoch_id: "CONTROLLER_B " + dateTimestamp.toString(),
        epoch_name: "CONTROLLER_B " + dateTimestamp.toString(),
        gauge_controller_id: 2,
        processed_at: date,
      },
    ])

    // createUserVoteTasks
    expect(createUserVoteTasksSpy).toBeCalledWith([
      {
        date,
        points: 600,
        user_address: USER_A.toLowerCase(),
        vote_task_id: 1n,
        votes_epoch_processed_proposal_id: 3n,
        voting_power: 100,
      },
      {
        date,
        points: 150,
        user_address: USER_B.toLowerCase(),
        vote_task_id: 2n,
        votes_epoch_processed_proposal_id: 3n,
        voting_power: 50,
      },
      {
        date,
        points: 7,
        user_address: USER_A.toLowerCase(),
        vote_task_id: 3n,
        votes_epoch_processed_proposal_id: 3n,
        voting_power: 2.5,
      },
      {
        date,
        points: 75,
        user_address: USER_B.toLowerCase(),
        vote_task_id: 3n,
        votes_epoch_processed_proposal_id: 3n,
        voting_power: 25,
      },
      {
        date,
        points: 3,
        user_address: USER_A.toLowerCase(),
        vote_task_id: 4n,
        votes_epoch_processed_proposal_id: 4n,
        voting_power: 12,
      },
      {
        date,
        points: 0,
        user_address: USER_B.toLowerCase(),
        vote_task_id: 4n,
        votes_epoch_processed_proposal_id: 4n,
        voting_power: 0.1,
      },
    ])
  })
})
