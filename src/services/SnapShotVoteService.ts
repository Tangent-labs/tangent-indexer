import axios from "axios"
import fs from "fs"
import path from "path"
import { Prisma } from "@prisma/client"

import { Proposal, ValidatedVotes } from "../type/data.js"
import { UserPointsVoteRepository } from "../db/Points/UserPointsVoteRepository.js"
import { ONE_WEEK_IN_SECONDS } from "@tangent/defi-resources/build/utils/durations.js"

type SnapshotProposal = {
  id: string
  title: string
  start: number
  end: number
  created: number
  state: string
  snapshot: number
  type: string
  choices: string[]
  space: { id: string; name: string }
}
export type SnapshotListProposalsApiReturn = {
  data: {
    data: {
      proposals: SnapshotProposal[]
    }
  }
}

export type SnapshotVotes = {
  id: string
  voter: string
  created: number
  choice: { [choiceId: string]: number } // TODO Check if we will need different type of Voting | string[] | number
  vp: number
  proposal: { id: string; title: string }
}
export type SnapshotGetProposalVotesApiReturn = {
  data: {
    data: {
      votes: SnapshotVotes[]
    }
  }
}

// https://snapshot.box/#/s:sdcrv.eth/proposal/0x10c44649c31c9716592c5ad92752e449d8b024d50adbd75cecea00864920941e
// https://vote.convexfinance.com/?ref=littlemight.com#/proposal/0x662c82169a3e7c0ff0baeb3ceb20f9d76115b2cd2d9b138cee48d8f8f80812b0
type VoteTask = { id: bigint; description: string; point_rate: number }
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
  computeUserVoteTasks = async (newEpoch: Date) => {
    const proposals = await this.listProposals(newEpoch.getTime() / 1000)

    let allVotes: ValidatedVotes[] = []
    for (const proposal of proposals) {
      allVotes = allVotes.concat(await this.getProposalVotes(proposal))
    }

    const voteTasks = await this.userVoteRepository.fetchTasks()

    const processedProposals = await this.userVoteRepository.storeEpochProposal(
      proposals.map((p) => {
        return {
          epoch_id: p.id,
          epoch_name: p.title,
          processed_at: new Date(p.end * 1000),
          snapshot_organisation_id: p.scoringChoices[0].snapshot_organisation_id,
        }
      })
    )

    await this.updateUserVoteTasks(allVotes, voteTasks, processedProposals)
  }

  updateUserVoteTasks = async (totalVotes: ValidatedVotes[], voteTasks: VoteTask[], processedProposals: Prisma.votes_epoch_processed_proposalCreateInput[]) => {
    const userAddresses = Array.from(new Set(totalVotes.map((t) => t?.voterAddress?.toLowerCase())))

    const boosts = await this.userVoteRepository.fetchUsersBoosts(userAddresses)

    const voteTasksMap = new Map<bigint, VoteTask>()
    for (const t of voteTasks) {
      voteTasksMap.set(t.id, t)
    }

    const rows: Prisma.vote_user_tasksCreateManyInput[] = totalVotes.map((v) => {
      const task = voteTasksMap.get(v.taskId)
      if (!task) {
        throw new Error(`No vote_tasks found with the ID : ${v.taskId}`)
      }
      const multiplier = Number(boosts.find((b) => b.user_address.toLowerCase() === v.voterAddress)?.multiplier) || 1
      const points = v.votingPower * task.point_rate * multiplier
      const idProposal = processedProposals.find((pp) => pp.epoch_id === v.proposalId)!.id!

      return {
        vote_task_id: task.id,
        user_address: v.voterAddress,
        voting_power: v.votingPower,
        points: Number(points.toFixed(0)),
        date: v.date,
        votes_epoch_processed_proposal_id: idProposal,
      }
    })

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

  async getOrganizations() {
    return await this.userVoteRepository.getSnapshotOrganisations()
  }

  async listProposals(newEpochSeconds: number): Promise<Proposal[]> {
    // Retrieve organisation structure in database
    const organizations = await this.getOrganizations()

    const organisationKeys = organizations.map((o) => o.key)
    const proposalTitleFilter = organizations.map((o) => o.proposal_title_search)

    // Fetch and filter proposals that have not being already treaded accross all organisations we are tracking
    const proposalsToProcess = await this.getFilteredProposalsByOrga(organisationKeys, proposalTitleFilter, newEpochSeconds)

    // Add organization rewardedChoices and votersToExclude to each proposal
    const proposalsWithRewards = proposalsToProcess.map((p) => {
      const orga = organizations.find((o) => o.key === p.space.id)
      if (!orga) {
        throw new Error(`No organisation found in db with the space id : ${p.space.id}`)
      }
      return { ...p, scoringChoices: orga.scoringChoices || [], excludedVoters: orga.votersToExclude.map((v) => v.user_address) || [] }
    })

    // we search for the rewarded choice in the choices array
    return proposalsWithRewards.map((proposal) => {
      // Get all rewarded choices from all organizations
      const scoringChoices = organizations.find((org) => proposal.space.id === org.key)!.scoringChoices!
      return {
        ...proposal,
        type: proposal.type || "basic",
        scoringChoices: scoringChoices.map((scoringChoice) => {
          const rewardIndex = proposal.choices.findIndex((choice) => choice.includes(scoringChoice.choice_name))
          // console.log(scoringChoice, rewardIndex)
          return {
            ...scoringChoice,
            choiceIndex: rewardIndex + 1,
          }
        }),
      }
    })
  }

  async getFilteredProposalsByOrga(organisationKeys: string[], titlesToFilter: string[], newEpoch: number) {
    const query = await this.loadGraphQLQuery("ListProposals")
    const proposals: SnapshotProposal[] = []
    let skip = 0

    // Do several call if needed
    while (true) {
      const data = (await axios.post(this.GRAPHQL_ENDPOINT, {
        query,
        variables: {
          organisationKeys,
          start_gte: newEpoch - 2 * ONE_WEEK_IN_SECONDS,
          end_lte: newEpoch,
          first: this.PAGE_SIZE,
          skip,
        },
      })) as SnapshotListProposalsApiReturn

      const batch = data?.data?.data.proposals ?? []
      proposals.push(...batch)
      if (batch.length < this.PAGE_SIZE) break
      if (proposals.length >= this.MAX_RESULTS) break

      skip += this.PAGE_SIZE
    }

    // Find in database the already processed proposals
    const processedProposals = await this.userVoteRepository.getProcessedProposals(proposals.map((p) => p.id))

    return (
      proposals
        // Remove the already processed proposals
        .filter((p) => !processedProposals.some((processedP) => processedP.epoch_id === p.id))
        // Filter only proposals containing the filter that we get from Organisation in database
        .filter((proposal) => titlesToFilter.some((titleFilter) => proposal.title.startsWith(titleFilter)))
    )
  }

  async getProposalVotes(proposal: Proposal) {
    let allVotes: SnapshotVotes[] = []
    let skip = 0
    const pageSize = 100
    try {
      const query = await this.loadGraphQLQuery("GetProposalVotes")
      while (true) {
        const variables = { proposalId: proposal.id, first: pageSize, skip }
        const response = (await axios.post(this.GRAPHQL_ENDPOINT, { query, variables })) as SnapshotGetProposalVotesApiReturn

        const batch = response.data.data.votes || []
        allVotes.push(
          ...batch.map((b) => {
            return {
              ...b,
              voter: b.voter.toLowerCase(),
            }
          })
        )
        if (batch.length < pageSize) break
        if (allVotes.length >= this.MAX_VOTES_PER_PROPOSAL) break
        skip += pageSize
      }

      // Removes votes emitted by voters
      if (proposal.excludedVoters.length > 0) {
        allVotes = allVotes.filter((vote) => !proposal.excludedVoters.includes(vote.voter))
      }

      // Keep only the votes having at least one vote non 0 for a scoring choice for the proposal
      if (proposal.scoringChoices.length > 0) {
        const rewardedIndices = proposal.scoringChoices.map((reward) => reward.choiceIndex)
        allVotes = allVotes.filter((vote) => Object.entries(vote.choice).some(([option, weight]) => weight > 0 && rewardedIndices.includes(parseInt(option))))
      }

      const validatedVotes: ValidatedVotes[] = []

      // Iteration over all votes from the proposal
      for (const vote of allVotes) {
        const choices = vote.choice
        // Computation of the full vote weight
        const totalWeight = Object.values(choices).reduce((acc, start) => acc + start, 0)

        // Iteration over all scoring choices
        for (const scoringChoice of proposal.scoringChoices) {
          // For each scoring choice, check if it exist in the choice from snapshot
          const found = Object.entries(choices).find(([keyy, _]) => Number(keyy) === scoringChoice.choiceIndex)
          if (found) {
            validatedVotes.push({
              taskId: scoringChoice.vote_task_id,
              voterAddress: vote.voter,
              // Compute real voting power regarding the weight
              votingPower: (vote.vp * found[1]) / totalWeight,
              proposalId: proposal.id,
              date: new Date(vote.created * 1_000),
            })
          }
        }
      }

      return validatedVotes
    } catch (error) {
      throw new Error(`Error fetching votes for proposal ${proposal.id}: ${error}`)
    }
  }

  private async loadGraphQLQuery(queryName: string): Promise<string> {
    const queryPath = path.join(process.cwd(), "src", "services", "snapshotQueries", `${queryName}.graphql`)
    return fs.readFileSync(queryPath, "utf-8")
  }
}
