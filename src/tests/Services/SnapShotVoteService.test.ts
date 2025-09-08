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
  let fetchTasksSpy: ReturnType<typeof vi.spyOn>
  let markProcessedProposalsSpy: ReturnType<typeof vi.spyOn>
  let getProcessedProposalsSpy: ReturnType<typeof vi.spyOn>
  let createUserVoteTasksSpy: ReturnType<typeof vi.spyOn>
  let getBlockTimestampSpy: ReturnType<typeof vi.spyOn>

  const userVoteRepository = {
    fetchTasks: vi.fn(),
    markProcessedProposals: vi.fn(),
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
    fetchTasksSpy = vi.spyOn(userVoteRepository as any, "fetchTasks").mockResolvedValue(undefined as any)
    markProcessedProposalsSpy = vi.spyOn(userVoteRepository as any, "markProcessedProposals").mockResolvedValue(undefined as any)
    getProcessedProposalsSpy = vi.spyOn(userVoteRepository as any, "getProcessedProposals").mockResolvedValue(undefined as any)
    createUserVoteTasksSpy = vi.spyOn(userVoteRepository as any, "createUserVoteTasks").mockResolvedValue(undefined as any)
    //
    blockService = new BlockService(blockRepository)
    getBlockTimestampSpy = vi.spyOn(blockService as any, "getBlockTimestamp").mockResolvedValue(undefined as any)
  })

  it("Should call computeUserVoteTasks() with votes and tasks", async () => {
    //

    const getProposalVotesSpy = vi.spyOn(snapShotVoteService as any, "getProposalVotes").mockResolvedValue(undefined as any)
    const updateUserVoteTasksSpy = vi.spyOn(snapShotVoteService as any, "updateUserVoteTasks").mockResolvedValue(undefined as any)

    listProposalsSpy.mockResolvedValue(mockProposals)
    getProposalVotesSpy.mockResolvedValue(mockVotes)
    fetchTasksSpy.mockResolvedValue(mockTasks)
    markProcessedProposalsSpy.mockResolvedValue(undefined)
    getProcessedProposalsSpy.mockResolvedValue([])
    getBlockTimestampSpy.mockResolvedValue(1754308728)

    const startBlock = 23067443
    const endBlock = 23097443

    await snapShotVoteService.computeUserVoteTasks(startBlock, endBlock, blockService, "http://127.0.0.1:8545/")

    expect(updateUserVoteTasksSpy).toHaveBeenCalledWith(mockVotes, mockTasks)

    expect(markProcessedProposalsSpy).toHaveBeenCalled()
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

  it("Should test getProposalVotes()", async () => {
    const mockProposal = {
      id: "0xde6dd14a7d7a26f4bf5029ac4dfcc1d077d8a1052e40aae8d477733df6cfdddb",
      title: "Gauge Weight for Week of 14th Aug 2025",
      start: 1755129600,
      end: 1755561600,
      snapshot: "23135571",
      created: 1755129665,
      state: "closed",
      type: "weighted",
      organizationRewards: [
        { task: "VOTE_01", value: "crvUSD+USD0" },
        {
          task: "VOTE_02",
          value: "Lending: Borrow crvUSD (ETHFI collateral)",
        },
        { task: "VOTE_03", value: "WETH+CVX" },
      ],
      excludedVoters: ["0x0000000000000000000000000000000000000000", "0x1111111111111111111111111111111111111111"],
      rewarded: [
        { choice: "WETH+CVX (0xB576…)", rewardIndex: 2, index: 34 },
        { choice: "crvUSD+USD0 (0xE1c7…)", rewardIndex: 0, index: 317 },
      ],
    }

    const result = await snapShotVoteService.getProposalVotes(mockProposal)

    expect(result).toContainEqual({
      task: "VOTE_03",
      value: "WETH+CVX",
      validationDate: new Date("2025-08-18T23:59:58.000Z"),
      voterAddress: "0xde1E6A7ED0ad3F61D531a8a78E83CcDdbd6E0c49",
      votingPower: 11619048.104955375,
      proposalId: "0xde6dd14a7d7a26f4bf5029ac4dfcc1d077d8a1052e40aae8d477733df6cfdddb",
    })

    const allVotersAddress = result.map((el) => el.voterAddress)

    const mockProposalWithExtraExcludedVoters = {
      id: "0xde6dd14a7d7a26f4bf5029ac4dfcc1d077d8a1052e40aae8d477733df6cfdddb",
      title: "Gauge Weight for Week of 14th Aug 2025",
      start: 1755129600,
      end: 1755561600,
      snapshot: "23135571",
      created: 1755129665,
      state: "closed",
      type: "weighted",
      organizationRewards: [
        { task: "VOTE_01", value: "crvUSD+USD0" },
        {
          task: "VOTE_02",
          value: "Lending: Borrow crvUSD (ETHFI collateral)",
        },
        { task: "VOTE_03", value: "WETH+CVX" },
      ],
      excludedVoters: allVotersAddress?.concat(["0x0000000000000000000000000000000000000000", "0x1111111111111111111111111111111111111111"]) as Array<string>,
      rewarded: [
        { choice: "WETH+CVX (0xB576…)", rewardIndex: 2, index: 34 },
        { choice: "crvUSD+USD0 (0xE1c7…)", rewardIndex: 0, index: 317 },
      ],
    }

    const votesWithoutAddresses = await snapShotVoteService.getProposalVotes(mockProposalWithExtraExcludedVoters)

    expect(votesWithoutAddresses).toEqual([])
  })
})
