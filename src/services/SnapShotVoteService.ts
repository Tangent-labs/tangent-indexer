import axios from "axios"
import fs from "fs"
import path from "path"
import { Prisma } from "@prisma/client"

import { Proposal, ValidatedTask, Reward, RewardedChoice, OrganizationConfig } from "../type/data.js"
import { UserPointsVoteRepository } from "../db/Points/UserPointsVoteRepository.js"
import { BlockService } from "./BlockService.js"

// https://snapshot.box/#/s:sdcrv.eth/proposal/0x10c44649c31c9716592c5ad92752e449d8b024d50adbd75cecea00864920941e
// https://vote.convexfinance.com
// /?ref=littlemight.com#/proposal/0x662c82169a3e7c0ff0baeb3ceb20f9d76115b2cd2d9b138cee48d8f8f80812b0

export class SnapShotVoteService {
  userVoteRepository: UserPointsVoteRepository

  constructor(userVoteRepository: UserPointsVoteRepository) {
    this.userVoteRepository = userVoteRepository
  }

  private readonly GRAPHQL_ENDPOINT = "https://hub.snapshot.org/graphql"
  private readonly PAGE_SIZE = 10
  private readonly MAX_RESULTS = 500
  private readonly MAX_VOTES_PER_PROPOSAL = 5000

  /**
   * Computes the range inside which we look for closed proposals
   * Fetches votes for those proposals
   * Fetches vote tasks in the DB
   * Pass to updateUserVoteTasks retrieved votes and DB registered tasks
   * Marks fetched proposals as processed to not deal with them on the next iteration
   */
  computeUserVoteTasks = async (startBlock: number, endBlock: number, blockService: BlockService, bestProvider: string) => {
    const blockDates = await blockService.fetchBlockTimestamps([startBlock, endBlock], bestProvider)

    const proposals = await this.listProposals(blockDates.get(startBlock)!, blockDates.get(endBlock)!)

    const totalVotes: Array<ValidatedTask> = []

    for (const proposal of proposals) {
      const votes = await this.getProposalVotes(proposal)

      votes.forEach((v) => totalVotes.push(v))
    }

    const voteTasks = await this.userVoteRepository.fetchTasks()

    await this.updateUserVoteTasks(totalVotes, voteTasks)

    await this.userVoteRepository.markProcessedProposals(proposals)
  }

  updateUserVoteTasks = async (totalVotes: Array<ValidatedTask>, voteTasks: { id: bigint; name: string; point_rate?: number }[]) => {
    const userAddresses = Array.from(new Set(totalVotes.map((t) => t?.voterAddress?.toLowerCase())))

    const boosts = await this.userVoteRepository.fetchUsersBoosts(userAddresses)

    const voteTasksMap = new Map<string, { id: bigint; point_rate?: number }>()
    for (const t of voteTasks) voteTasksMap.set(t.name, t)

    const rows: Prisma.vote_user_tasksCreateManyInput[] = totalVotes
      .map((v) => {
        const task = voteTasksMap.get(v.task)
        if (!task || !task.point_rate) {
          return null
        }

        // Validate all required fields
        if (!v.voterAddress || !v.proposalId || v.votingPower === undefined || v.votingPower === null) {
          return null
        }

        const multiplier = Number(boosts.find((b) => b.user_address.toLowerCase() === v?.voterAddress?.toLowerCase())?.multiplier) || 1

        const points = v.votingPower * task.point_rate * multiplier

        return {
          vote_task_id: task.id,
          user_address: v.voterAddress.toLowerCase(),
          proposal_id: v.proposalId,
          voting_power: v.votingPower,
          points: Number(points.toFixed(0)),
        }
      })
      .filter((row) => row !== null)

    if (!rows.length) {
      return
    }

    await this.userVoteRepository.createUserVoteTasks(rows)

    // create users from addresses which voted
    const uniqueAddressesSet = new Set<string>()
    rows.forEach((v) => {
      uniqueAddressesSet.add(v.user_address.toLowerCase())
    })
    const votersAddresses = Array.from(uniqueAddressesSet).map((address) => ({ address }))
    await this.userVoteRepository.insertAddresses(votersAddresses)
  }

  getOrganizations(): OrganizationConfig[] {
    const list = [
      {
        key: "cvx.eth",
        value: "https://vote.convexfinance.com/",
        title: "Gauge Weight for Week",
        rewards: [
          { task: "VOTE_01", value: "crvUSD+USD0" },
          { task: "VOTE_02", value: "Lending: Borrow crvUSD (ETHFI collateral)" },
          { task: "VOTE_03", value: "WETH+CVX" },
        ],
        excludedVoters: [
          "0x0000000000000000000000000000000000000000", // Example excluded address
          "0x1111111111111111111111111111111111111111", // Example excluded address
        ],
      },
      {
        key: "sdcrv.eth",
        value: "https://snapshot.box/#/s:sdcrv.eth",
        title: "Gauge vote CRV",
        rewards: [
          { task: "VOTE_03", value: "crvUSD+USD0" },
          { task: "VOTE_04", value: "Lending: Borrow crvUSD (ETHFI collateral)" },
        ],
        excludedVoters: [
          "0x2222222222222222222222222222222222222222", // Example excluded address
        ],
      },
    ]

    return list
  }

  async listProposals(fromTs: number, toTs: number): Promise<Proposal[]> {
    const organizations = this.getOrganizations()

    const organisationKeys = organizations.map((o) => o.key)

    const orgaProposals = await this.listProposalsByOrga(organisationKeys, { fromTs, toTs })

    // Add organization rewards to each proposal
    const proposalsWithRewards = orgaProposals.map((p) => {
      const orga = organizations.find((o) => o.key === p.space.id)

      return { ...p, organizationRewards: orga?.rewards || [], excludedVoters: orga?.excludedVoters || [] }
    })

    // Get all rewarded choices from all organizations
    const allRewardedChoices = organizations.flatMap((org) => org.rewards.map((reward) => reward.value))

    // we search for the rewarded choice in the choices array
    return proposalsWithRewards.map((proposal) => {
      return {
        id: proposal.id,
        title: proposal.title,
        start: proposal.start,
        end: proposal.end,
        snapshot: proposal.snapshot,
        created: proposal.created,
        state: proposal.state,
        type: proposal.type || "basic",
        organizationRewards: proposal.organizationRewards,
        excludedVoters: proposal.excludedVoters,
        rewarded: proposal.choices
          .map((choice: any, index: number) => {
            const rewardIndex = allRewardedChoices.findIndex((rewardedChoice: string) => choice.includes(rewardedChoice))
            if (rewardIndex > -1) {
              return {
                choice,
                rewardIndex,
                index: index + 1,
              }
            }
            return null
          })
          .filter((choice: any) => choice !== null),
      }
    }) as Proposal[]
  }

  async listProposalsByOrga(organisationKeys: Array<string>, range: { fromTs: number; toTs: number }): Promise<any[]> {
    const query = await this.loadGraphQLQuery("ListProposals")
    const all: any[] = []
    let skip = 0

    while (true) {
      const { data } = await axios.post(this.GRAPHQL_ENDPOINT, {
        query,
        variables: {
          organisationKeys,
          start_lte: range.toTs,
          end_gte: range.fromTs,
          first: this.PAGE_SIZE,
          skip,
        },
      })

      const batch: any[] = data?.data?.proposals ?? []
      all.push(...batch)
      if (batch.length < this.PAGE_SIZE) break
      if (all.length >= this.MAX_RESULTS) break

      skip += this.PAGE_SIZE
    }

    const allIds = all.map((p) => p.id)

    const processedProposals = await this.userVoteRepository.getProcessedProposals(allIds)

    return all.filter((p) => !processedProposals.some((processedP) => processedP.proposal_id === p?.id))
  }

  async getProposalVotes(proposal: Proposal): Promise<ValidatedTask[]> {
    let allVotes: any[] = []
    let skip = 0
    const pageSize = 100

    try {
      const query = await this.loadGraphQLQuery("GetProposalVotes")
      while (true) {
        const variables = { proposalId: proposal.id, first: pageSize, skip }
        const response = await axios.post(this.GRAPHQL_ENDPOINT, { query, variables })
        const batch = response.data.data.votes || []
        allVotes.push(...batch)
        if (batch.length < pageSize) break
        if (allVotes.length >= this.MAX_VOTES_PER_PROPOSAL) break
        skip += pageSize
      }

      if (proposal.excludedVoters && proposal.excludedVoters.length > 0) {
        allVotes = allVotes.filter((vote: any) => !proposal.excludedVoters?.includes(vote.voter))
      }

      if (proposal.rewarded && proposal.rewarded.length > 0) {
        const rewardedIndices = proposal.rewarded.map((reward: any) => reward.index)

        allVotes = allVotes.filter((vote: any) =>
          Object.entries(vote.choice).some(([option, weight]: [string, any]) => weight > 0 && rewardedIndices.includes(parseInt(option)))
        )
      }

      const validatedVotes: ValidatedTask[] = []
      if (proposal.organizationRewards && allVotes.length > 0) {
        for (const vote of allVotes) {
          const choice = vote.choice
          for (const reward of proposal.organizationRewards) {
            const isValidated = this.validateVoteAgainstTask(choice, reward, proposal.rewarded || [])
            if (isValidated) {
              validatedVotes.push({
                task: reward.task,
                value: reward.value,
                voterAddress: vote.voter,
                votingPower: vote.vp || 0,
                proposalId: proposal.id,
              })
            }
          }
        }
      }

      return validatedVotes
    } catch (error) {
      console.error(`Error fetching votes for proposal ${proposal.id}:`, error)
      return [] // Continue processing other proposals
    }
  }

  private matchesReward = (choice: string, rewardValue: string): boolean => {
    return choice.split(" ").some((part) => part === rewardValue)
  }

  private validateVoteAgainstTask(voteChoice: any, reward: Reward, rewardedChoices: RewardedChoice[]): boolean {
    const matchingRewardedChoice = rewardedChoices.find((rc) => this.matchesReward(rc.choice, reward.value))

    if (!matchingRewardedChoice) {
      return false
    }

    // Check if the vote includes the matching choice index
    if (typeof voteChoice === "object") {
      return Object.entries(voteChoice).some(([option, weight]: [string, any]) => parseInt(option) === matchingRewardedChoice.index && weight > 0)
    } else if (typeof voteChoice === "number") {
      return voteChoice === matchingRewardedChoice.index
    } else if (Array.isArray(voteChoice)) {
      return voteChoice.includes(matchingRewardedChoice.index)
    }

    return false
  }

  private async loadGraphQLQuery(queryName: string): Promise<string> {
    const queryPath = path.join(process.cwd(), "src", "services", "snapshotQueries", `${queryName}.graphql`)
    return fs.readFileSync(queryPath, "utf-8")
  }
}
