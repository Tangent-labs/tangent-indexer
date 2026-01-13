import axios from "axios"
import { UserPointsVoteRepository } from "../../db/Points/UserPointsVoteRepository.js"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SnapshotGetProposalVotesApiReturn, SnapShotVoteService } from "../../services/SnapShotVoteService.js"
import { Proposal, ValidatedVotes } from "src/type/data.js"

const usr1 = "usr1"
const usr2 = "usr2"
const usr3 = "usr3"
const usr4 = "usr4"

const excludedVoters1 = [usr1]
const excludedVoters2 = [usr2, usr3]

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
    excludedVoters: excludedVoters1,
    rewarded: [],
  },
  {
    id: "proposalIdTwo",
    title: "Gauge Weight for Week of 14th Aug 2025",
    start: 1755129600,
    end: 1755561600,
    snapshot: 23135571,
    created: 1755129665,
    state: "closed",
    type: "weighted",
    organizationRewards: [],
    excludedVoters: excludedVoters2,
    rewarded: [],
  },
]

const mockVotes: ValidatedVotes[] = [
  {
    taskId: 2n,
    voterAddress: usr1,
    votingPower: 1234,
    proposalId: "proposalIdOne",
    date: new Date(),
  },
  {
    taskId: 3n,
    voterAddress: usr2,
    votingPower: 4567,
    proposalId: "proposalIdOne",
    date: new Date(),
  },
  {
    taskId: 3n,
    voterAddress: usr3,
    votingPower: 4567,
    proposalId: "proposalIdOne",
    date: new Date(),
  },
  {
    taskId: 4n,
    voterAddress: usr4,
    votingPower: 300000,
    proposalId: "proposalIdTwo",
    date: new Date(),
  },
]

const mockTasks = [
  { id: 2n, point_rate: 3, description: "vote2" },
  { id: 3n, point_rate: 12, description: "vote3" },
  { id: 4n, point_rate: 5, description: "vote4" },
]

// --------------------------------------------
// SnapShotVoteService test
// --------------------------------------------
describe("SnapShotVoteService", () => {
  let snapShotVoteService: SnapShotVoteService
  let listProposalsSpy: ReturnType<typeof vi.spyOn>
  let fetchTasksSpy: ReturnType<typeof vi.spyOn>
  let markProcessedProposalsSpy: ReturnType<typeof vi.spyOn>
  let getProcessedProposalsSpy: ReturnType<typeof vi.spyOn>
  let createUserVoteTasksSpy: ReturnType<typeof vi.spyOn>
  let fetchBlockTimestampsSpy: ReturnType<typeof vi.spyOn>
  let fetchUsersBoostsSpy: ReturnType<typeof vi.spyOn>

  // Mock axios for Vitest
  vi.mock("axios", () => {
    return {
      default: {
        post: vi.fn(),
      },
    }
  })

  // at the very top of the test file, before any imports that transitively import BlockService
  vi.mock("config/indexer_config", () => ({
    CHAIN_RPCS: { "1": "http://127.0.0.1:8545" },
    // if the module exports an init function, stub it too:
    _initEnv: vi.fn(),
  }))

  const userVoteRepository = {
    fetchTasks: vi.fn(),
    markProcessedProposals: vi.fn(),
    getProcessedProposals: vi.fn(),
    createUserVoteTasks: vi.fn(),
    fetchUsersBoosts: vi.fn(),
    insertAddresses: vi.fn(),
  } as any as UserPointsVoteRepository

  const blockService = {
    fetchBlockTimestamps: vi.fn(),
  } as any

  beforeEach(() => {
    vi.clearAllMocks()

    snapShotVoteService = new SnapShotVoteService(userVoteRepository)
    listProposalsSpy = vi.spyOn(snapShotVoteService as any, "listProposals").mockResolvedValue(undefined as any)
    fetchTasksSpy = vi.spyOn(userVoteRepository as any, "fetchTasks").mockResolvedValue(undefined as any)
    markProcessedProposalsSpy = vi.spyOn(userVoteRepository as any, "markProcessedProposals").mockResolvedValue(undefined as any)
    getProcessedProposalsSpy = vi.spyOn(userVoteRepository as any, "getProcessedProposals").mockResolvedValue(undefined as any)
    createUserVoteTasksSpy = vi.spyOn(userVoteRepository as any, "createUserVoteTasks").mockResolvedValue(undefined as any)
    fetchUsersBoostsSpy = vi.spyOn(userVoteRepository as any, "fetchUsersBoosts").mockResolvedValue(undefined as any)

    fetchBlockTimestampsSpy = vi.spyOn(blockService as any, "fetchBlockTimestamps").mockResolvedValue(undefined as any)
    ;(axios.post as any).mockReset()
  })

  it("Should call computeUserVoteTasks() with votes and tasks", async () => {
    //

    const getProposalVotesSpy = vi.spyOn(snapShotVoteService as any, "getProposalVotes").mockResolvedValue(undefined as any)
    const updateUserVoteTasksSpy = vi.spyOn(snapShotVoteService as any, "updateUserVoteTasks").mockResolvedValue(undefined as any)

    listProposalsSpy.mockResolvedValue(mockProposals)
    getProposalVotesSpy.mockResolvedValue([mockVotes[0], mockVotes[1], mockVotes[2]]).mockReturnValueOnce([mockVotes[3]])
    fetchTasksSpy.mockResolvedValue(mockTasks)
    markProcessedProposalsSpy.mockResolvedValue(undefined)
    getProcessedProposalsSpy.mockResolvedValue([])
    fetchBlockTimestampsSpy.mockResolvedValue(new Map<number, number>())

    const startBlock = 23067443
    const endBlock = 23097443
    const url = "http://127.0.0.1:8545/"
    await snapShotVoteService.computeUserVoteTasks(startBlock, endBlock, blockService, url)

    expect(updateUserVoteTasksSpy).toHaveBeenCalledWith([mockVotes[3], mockVotes[0], mockVotes[1], mockVotes[2]], mockTasks)

    // expect(markProcessedProposalsSpy).toHaveBeenCalled()
  })

  it("Should create updatedTasks inside updateUserVoteTasks()", async () => {
    fetchUsersBoostsSpy.mockResolvedValue([
      { user_address: usr1, multiplier: 1.1 },
      { user_address: usr2, multiplier: 2 },
      { user_address: usr4, multiplier: 2 },
    ])
    const date = mockVotes[0].date
    await snapShotVoteService.updateUserVoteTasks(mockVotes, mockTasks)

    const updatedTasks = [
      {
        vote_task_id: 2n,
        user_address: usr1,
        proposal_id: "proposalIdOne",
        voting_power: 1234,
        points: Number((1234 * 1.1 * 3).toFixed(0)),
        date,
      },
      {
        vote_task_id: 3n,
        user_address: usr2,
        proposal_id: "proposalIdOne",
        voting_power: 4567,
        points: Number((4567 * 2 * 12).toFixed(0)),
        date,
      },
      {
        vote_task_id: 3n,
        user_address: usr3,
        proposal_id: "proposalIdOne",
        voting_power: 4567,
        points: Number((4567 * 12).toFixed(0)),
        date,
      },
      {
        vote_task_id: 4n,
        user_address: usr4,
        proposal_id: "proposalIdTwo",
        voting_power: 300000,
        points: Number((300000 * 2 * 5).toFixed(0)),
        date,
      },
    ]

    expect(createUserVoteTasksSpy).toHaveBeenCalledWith(updatedTasks)
  })

  it("Should test getProposalVotes()", async () => {
    const mockProposal: Proposal = {
      id: "0xproposal",
      type: "weighted",
      title: "GaugeWeight ",
      created: 112344,
      end: 123455,
      snapshot: 12,
      start: 12344,
      state: "closed",
      excludedVoters: excludedVoters1,
      scoringChoices: [
        { id: 34n, choice_name: "WETH+CVX", choiceIndex: 34, snapshot_organisation_id: 1n, vote_task_id: 3n },
        { id: 35n, choice_name: "crvUSD+USD0", choiceIndex: 19, snapshot_organisation_id: 2n, vote_task_id: 4n },
      ],
    }

    const firstPage: SnapshotGetProposalVotesApiReturn = {
      data: {
        data: {
          votes: [
            {
              id: "v1",
              voter: usr1,
              created: 1755628798,
              vp: 1000,
              choice: { "34": 100 },
              proposal: { id: "0xproposal", title: "Gauge" },
            },
            {
              id: "v1",
              voter: usr2,
              created: 1755628798,
              vp: 333333,
              choice: { "34": 1000, "19": 1200, "4": 100 },
              proposal: { id: "0xproposal", title: "Gauge" },
            },
          ],
        },
      },
    }

    const secondPage = { data: { data: { votes: [] } } }

    ;(axios.post as any).mockResolvedValueOnce(firstPage)

    const result = await snapShotVoteService.getProposalVotes(mockProposal)
    expect(result).toHaveLength(2)

    expect(result[0]).toMatchObject({
      taskId: 3n,
      voterAddress: "usr2",
      votingPower: 144927.39130434784,
      proposalId: "0xproposal",
    })

    const voters = result.map((r) => r?.voterAddress)

    const mockProposal2 = {
      ...mockProposal,
      excludedVoters: voters.concat(["0x1111111111111111111111111111111111111111"]),
    }

    ;(axios.post as any).mockResolvedValueOnce(secondPage)

    const emptyResult = await snapShotVoteService.getProposalVotes(mockProposal2 as any)

    expect(emptyResult).toEqual([])
  })

  it("Should paginate accross 3 pages", async () => {
    ;(snapShotVoteService as any).MAX_VOTES_PER_PROPOSAL = 300

    const makeVotes = (n: number, offset = 0) =>
      Array.from({ length: n }, (_, i) => ({
        id: `v${i + offset}`,
        voter: `0x${(i + offset).toString().padStart(40, "0")}`,
        created: 1755628798,
        vp: 1,
        choice: { "34": 1, "12": 2 },
        proposal: { id: "0xproposal" },
      }))

    const page1 = { data: { data: { votes: makeVotes(100, 0) } } }
    const page2 = { data: { data: { votes: makeVotes(100, 100) } } }
    const page3 = { data: { data: { votes: makeVotes(60, 200) } } }

    ;(axios.post as any).mockResolvedValueOnce(page1).mockResolvedValueOnce(page2).mockResolvedValueOnce(page3)

    const proposal: Proposal = {
      id: "0xproposal",
      type: "weighted",
      title: "GaugeWeight ",
      created: 112344,
      end: 123455,
      snapshot: 12,
      start: 12344,
      state: "closed",
      excludedVoters: ["0x0000000000000000000000000000000000000099", "0x0000000000000000000000000000000000000098"],
      scoringChoices: [
        { id: 34n, choice_name: "USG+USDC", choiceIndex: 34, snapshot_organisation_id: 1n, vote_task_id: 3n },
        { id: 35n, choice_name: "USG+frxUSD", choiceIndex: 19, snapshot_organisation_id: 2n, vote_task_id: 4n },
        { id: 36n, choice_name: "USG+wcrvUSD", choiceIndex: 12, snapshot_organisation_id: 2n, vote_task_id: 5n },
      ],
    }

    const res = await snapShotVoteService.getProposalVotes(proposal)
    expect(res.length).toBe(516)
  })

  it("Should stop pagination after first page because of the MAX_VOTES limit", async () => {
    ;(snapShotVoteService as any).MAX_VOTES_PER_PROPOSAL = 100

    const makeVotes = (n: number, offset = 0) =>
      Array.from({ length: n }, (_, i) => ({
        id: `v${i + offset}`,
        voter: `0x${(i + offset).toString().padStart(40, "0")}`,
        created: 1755628798,
        vp: 1,
        choice: { "34": 1 },
        proposal: { id: "0xproposal" },
      }))

    const page1 = { data: { data: { votes: makeVotes(100, 0) } } }
    const page2 = { data: { data: { votes: makeVotes(100, 100) } } }

    ;(axios.post as any).mockResolvedValueOnce(page1).mockResolvedValueOnce(page2)

    const proposal: Proposal = {
      id: "0xproposal",
      type: "weighted",
      title: "GaugeWeight ",
      created: 112344,
      end: 123455,
      snapshot: 12,
      start: 12344,
      state: "closed",
      excludedVoters: ["0x0000000000000000000000000000000000000099", "0x0000000000000000000000000000000000000098"],
      scoringChoices: [
        { id: 34n, choice_name: "USG+USDC", choiceIndex: 34, snapshot_organisation_id: 1n, vote_task_id: 3n },
        { id: 35n, choice_name: "USG+frxUSD", choiceIndex: 19, snapshot_organisation_id: 2n, vote_task_id: 4n },
        { id: 36n, choice_name: "USG+wcrvUSD", choiceIndex: 12, snapshot_organisation_id: 2n, vote_task_id: 5n },
      ],
    }
    const res = await snapShotVoteService.getProposalVotes(proposal)
    expect(res.length).toBe(98)
  })
})
