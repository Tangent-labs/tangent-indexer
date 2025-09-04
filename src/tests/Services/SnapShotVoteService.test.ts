import { beforeEach, describe, expect, it, vi } from "vitest"
import SnapShotVoteService from "services/SnapShotVoteService"
import { UserVoteRepository } from "db/UserVoteRepository"
import { BlockService } from "services/BlockService"
import { BlockRepository } from "db/BlockRepository"

const mockProposals = [
  {
    id: "proposalIdOne",
    title: "Gauge Weight for Week of 14th Aug 2025",
    start: 1755129600,
    end: 1755561600,
    snapshot: 23135571,
    created: 1755129665,
    state: "closed",
    type: "weighted",
    organizationRewards: [],
    excludedVoters: ["0x0000000000000000000000000000000000000000", "0x1111111111111111111111111111111111111111"],
    rewarded: [],
  },
]

const mockVotes = [
  {
    task: "VOTE_03",
    value: "WETH+CVX",
    validationDate: new Date("2025-07-31T00:47:17.000Z"),
    voterAddress: "0xvoter1",
    votingPower: 1234,
    proposalId: "proposalIdOne",
  },
  {
    task: "VOTE_03",
    value: "WETH+CVX",
    validationDate: new Date("2025-07-31T01:50:01.000Z"),
    voterAddress: "0xvoter2",
    votingPower: 4567,
    proposalId: "proposalIdOne",
  },
]

const mockTasks = [
  { id: 2n, name: "VOTE_02", point_rate: 1, unit: "vote" },
  { id: 3n, name: "VOTE_03", point_rate: 1, unit: "vote" },
]

// --------------------------------------------
// SnapShotVoteService test
// --------------------------------------------
describe("SnapShotVoteService", () => {
  let snapShotVoteService: SnapShotVoteService
  let blockService: BlockService
  let listProposalsSpy: ReturnType<typeof vi.spyOn>
  let getProposalVotesSpy: ReturnType<typeof vi.spyOn>
  let fetchTasksSpy: ReturnType<typeof vi.spyOn>
  let markProposalsProcessedSpy: ReturnType<typeof vi.spyOn>
  let getProcessedProposalsSpy: ReturnType<typeof vi.spyOn>
  let createUserVoteTasksSpy: ReturnType<typeof vi.spyOn>
  let getBlockTimestampSpy: ReturnType<typeof vi.spyOn>

  const userVoteRepository = {
    fetchTasks: vi.fn(),
    markProposalsProcessed: vi.fn(),
    getProcessedProposals: vi.fn(),
    createUserVoteTasks: vi.fn(),
  } as any as UserVoteRepository

  const blockRepository = {
    getBlockTimestamp: vi.fn(),
  } as any as BlockRepository

  beforeEach(() => {
    vi.clearAllMocks()

    snapShotVoteService = new SnapShotVoteService(userVoteRepository)
    listProposalsSpy = vi.spyOn(snapShotVoteService as any, "listProposals").mockResolvedValue(undefined as any)
    getProposalVotesSpy = vi.spyOn(snapShotVoteService as any, "getProposalVotes").mockResolvedValue(undefined as any)
    fetchTasksSpy = vi.spyOn(userVoteRepository as any, "fetchTasks").mockResolvedValue(undefined as any)
    markProposalsProcessedSpy = vi.spyOn(userVoteRepository as any, "markProposalsProcessed").mockResolvedValue(undefined as any)
    getProcessedProposalsSpy = vi.spyOn(userVoteRepository as any, "getProcessedProposals").mockResolvedValue(undefined as any)
    createUserVoteTasksSpy = vi.spyOn(userVoteRepository as any, "createUserVoteTasks").mockResolvedValue(undefined as any)
    //
    blockService = new BlockService(blockRepository)
    getBlockTimestampSpy = vi.spyOn(blockService as any, "getBlockTimestamp").mockResolvedValue(undefined as any)
  })

  it("Should call computeUserVoteTasks() with votes and tasks", async () => {
    //

    const updateUserVoteTasksSpy = vi.spyOn(snapShotVoteService as any, "updateUserVoteTasks").mockResolvedValue(undefined as any)

    listProposalsSpy.mockResolvedValue(mockProposals)
    getProposalVotesSpy.mockResolvedValue(mockVotes)
    fetchTasksSpy.mockResolvedValue(mockTasks)
    markProposalsProcessedSpy.mockResolvedValue(undefined)
    getProcessedProposalsSpy.mockResolvedValue([])
    getBlockTimestampSpy.mockResolvedValue(1754308728)

    const startBlock = 23067443
    const endBlock = 23097443

    await snapShotVoteService.computeUserVoteTasks(startBlock, endBlock, blockService, "http://127.0.0.1:8545/")

    expect(updateUserVoteTasksSpy).toHaveBeenCalledWith(mockVotes, mockTasks)

    expect(markProposalsProcessedSpy).toHaveBeenCalled()
  })

  it("Should create updatedTasks inside updateUserVoteTasks()", async () => {
    await snapShotVoteService.updateUserVoteTasks(mockVotes, mockTasks)

    const updatedTasks = [
      {
        vote_task_id: 3n,
        user_address: "0xvoter1",
        proposal_id: "proposalIdOne",
        validation_at: new Date("2025-07-31T00:47:17.000Z"),
        voting_power: 1234,
        rate: 1,
      },
      {
        vote_task_id: 3n,
        user_address: "0xvoter2",
        proposal_id: "proposalIdOne",
        validation_at: new Date("2025-07-31T01:50:01.000Z"),
        voting_power: 4567,
        rate: 1,
      },
    ]

    expect(createUserVoteTasksSpy).toHaveBeenCalledWith(updatedTasks)
  })
})
