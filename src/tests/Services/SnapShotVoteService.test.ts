import axios from "axios"
import { UserVoteRepository } from "db/UserVoteRepository"
import { beforeEach, describe, expect, it, vi } from "vitest"
import SnapShotVoteService from "services/SnapShotVoteService"
import { JsonRpcProvider } from "ethers"

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
  let listProposalsSpy: ReturnType<typeof vi.spyOn>
  let fetchTasksSpy: ReturnType<typeof vi.spyOn>
  let markProcessedProposalsSpy: ReturnType<typeof vi.spyOn>
  let getProcessedProposalsSpy: ReturnType<typeof vi.spyOn>
  let createUserVoteTasksSpy: ReturnType<typeof vi.spyOn>
  let getBlockTimestampSpy: ReturnType<typeof vi.spyOn>
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
  } as any as UserVoteRepository

  const blockService = {
    getBlockTimestamp: vi.fn(),
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

    getBlockTimestampSpy = vi.spyOn(blockService as any, "getBlockTimestamp").mockResolvedValue(undefined as any)
      ; (axios.post as any).mockReset()
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
    const provider = new JsonRpcProvider("http://127.0.0.1:8545/")
    await snapShotVoteService.computeUserVoteTasks(startBlock, endBlock, blockService, provider)

    expect(updateUserVoteTasksSpy).toHaveBeenCalledWith(mockVotes, mockTasks)

    expect(markProcessedProposalsSpy).toHaveBeenCalled()
  })

  it("Should create updatedTasks inside updateUserVoteTasks()", async () => {
    fetchUsersBoostsSpy.mockResolvedValue([
      { user_address: "0xvoter1", multiplier: 1.1 },
      { user_address: "0xvoter2", multiplier: 2 },
    ])

    await snapShotVoteService.updateUserVoteTasks(mockVotes, mockTasks)

    const updatedTasks = [
      {
        vote_task_id: 3n,
        user_address: "0xvoter1",
        proposal_id: "proposalIdOne",
        validation_at: new Date("2025-07-31T00:47:17.000Z"),
        voting_power: 1234,
        points: Number((1234 * 1.1).toFixed(0)),
      },
      {
        vote_task_id: 3n,
        user_address: "0xvoter2",
        proposal_id: "proposalIdOne",
        validation_at: new Date("2025-07-31T01:50:01.000Z"),
        voting_power: 4567,
        points: Number((4567 * 2).toFixed(0)),
      },
    ]

    expect(createUserVoteTasksSpy).toHaveBeenCalledWith(updatedTasks)
  })

  it("Should test getProposalVotes()", async () => {
    const mockProposal: any = {
      id: "0xproposal",
      type: "weighted",
      organizationRewards: [
        { task: "VOTE_01", value: "crvUSD+USD0" },
        { task: "VOTE_03", value: "WETH+CVX" },
      ],
      excludedVoters: ["0x0000000000000000000000000000000000000000"],
      rewarded: [
        { choice: "WETH+CVX (0xB576…)", rewardIndex: 2, index: 34 },
        { choice: "crvUSD+USD0 (0xE1c7…)", rewardIndex: 0, index: 317 },
      ],
    }

    const firstPage = {
      data: {
        data: {
          votes: [
            {
              id: "v1",
              voter: "0xde1E6A7ED0ad3F61D531a8a78E83CcDdbd6E0c49",
              created: 1755628798,
              vp: 11619048.104955375,
              choice: { "34": 100 },
              proposal: { id: "0xproposal", title: "Gauge" },
            },
          ],
        },
      },
    }

    const secondPage = { data: { data: { votes: [] } } }

      ; (axios.post as any).mockResolvedValueOnce(firstPage)

    const result = await snapShotVoteService.getProposalVotes(mockProposal)

    expect(result).toHaveLength(1)

    expect(result[0]).toMatchObject({
      task: "VOTE_03",
      value: "WETH+CVX",
      voterAddress: "0xde1E6A7ED0ad3F61D531a8a78E83CcDdbd6E0c49",
      proposalId: "0xproposal",
    })

    expect(result[0]?.validationDate?.toISOString()).toBe("2025-08-19T18:39:58.000Z")

    const voters = result.map((r) => r?.voterAddress)

    const mockProposal2 = {
      ...mockProposal,
      excludedVoters: voters.concat(["0x1111111111111111111111111111111111111111"]),
    }

      ; (axios.post as any).mockResolvedValueOnce(secondPage)

    const emptyResult = await snapShotVoteService.getProposalVotes(mockProposal2 as any)

    expect(emptyResult).toEqual([])
  })

  it("Should paginate accross 3 pages", async () => {
    ; (snapShotVoteService as any).MAX_VOTES_PER_PROPOSAL = 300

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
    const page3 = { data: { data: { votes: makeVotes(60, 200) } } }

      ; (axios.post as any).mockResolvedValueOnce(page1).mockResolvedValueOnce(page2).mockResolvedValueOnce(page3)

    const proposal: any = {
      id: "0xproposal",
      organizationRewards: [
        { task: "VOTE_01", value: "crvUSD+USD0" },
        { task: "VOTE_03", value: "WETH+CVX" },
      ],
      excludedVoters: ["0x0000000000000000000000000000000000000000"],
      rewarded: [
        { choice: "WETH+CVX (0xB576…)", rewardIndex: 2, index: 34 },
        { choice: "crvUSD+USD0 (0xE1c7…)", rewardIndex: 0, index: 317 },
      ],
    }

    const res = await snapShotVoteService.getProposalVotes(proposal)
    expect(res.length).toBe(259)
  })

  it("Should stop pagination after first page because of the MAX_VOTES limit", async () => {
    ; (snapShotVoteService as any).MAX_VOTES_PER_PROPOSAL = 100

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

      ; (axios.post as any).mockResolvedValueOnce(page1).mockResolvedValueOnce(page2)

    const proposal: any = {
      id: "0xproposal",
      organizationRewards: [
        { task: "VOTE_01", value: "crvUSD+USD0" },
        { task: "VOTE_03", value: "WETH+CVX" },
      ],
      rewarded: [
        { choice: "WETH+CVX (0xB576…)", rewardIndex: 2, index: 34 },
        { choice: "crvUSD+USD0 (0xE1c7…)", rewardIndex: 0, index: 317 },
      ],
    }

    const res = await snapShotVoteService.getProposalVotes(proposal)
    expect(res.length).toBe(100)
  })
})
