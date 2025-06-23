import axios from "axios"
import fs from "fs"
import path from "path"
import { Proposal, ValidatedTask, Reward, RewardedChoice, OrganizationConfig } from "type/data"

// https://snapshot.box/#/s:sdcrv.eth/proposal/0x10c44649c31c9716592c5ad92752e449d8b024d50adbd75cecea00864920941e
// https://vote.convexfinance.com/?ref=littlemight.com#/proposal/0x662c82169a3e7c0ff0baeb3ceb20f9d76115b2cd2d9b138cee48d8f8f80812b0

class SnapShotVoteService {
  private readonly GRAPHQL_ENDPOINT = "https://hub.snapshot.org/graphql"

  public getOrganizations(): OrganizationConfig[] {
    const list = [
      {
        key: "cvx.eth",
        value: "https://vote.convexfinance.com/",
        title: "Gauge Weight for Week",
        rewards: [
          { task: "VOTE_01", value: "crvUSD+USD0" },
          { task: "VOTE_02", value: "Lending: Borrow crvUSD (ETHFI collateral)" },
          { task: "VOTE_02", value: "tgUSD/crvUSD" },
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

  async listProposals(): Promise<Proposal[]> {
    const organizations = this.getOrganizations()
    const proposals = []

    for (const organization of organizations) {
      const orgaProposals = await this.listProposalByOrga(organization.key, organization.title)

      // Add organization rewards to each proposal
      const proposalsWithRewards = orgaProposals.map((proposal: any) => ({
        ...proposal,
        organizationRewards: organization.rewards,
        excludedVoters: organization.excludedVoters || [],
      }))

      proposals.push(...proposalsWithRewards)
    }

    // Get all rewarded choices from all organizations
    const allRewardedChoices = organizations.flatMap((org) => org.rewards.map((reward) => reward.value))

    // we search for the rewarded choice in the choices array
    return proposals.map((proposal) => {
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
                index,
              }
            }
            return null
          })
          .filter((choice: any) => choice !== null),
      }
    }) as Proposal[]
  }

  async listProposalByOrga(orga: string, title: string) {
    try {
      // Load the GraphQL query from the external file
      const query = await this.loadGraphQLQuery("ListProposalByOrga")

      // Calculate timestamp for two weeks ago (14 days)
      const days = 20
      const timeAgo = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000)

      const response = await axios.post(this.GRAPHQL_ENDPOINT, {
        query,
        variables: {
          orga,
          timeAgo,
          title,
        },
      })

      return response.data.data.proposals
    } catch (error) {
      console.error("Error fetching proposals:", error)
      throw error
    }
  }

  async test() {
    const query = await this.loadGraphQLQuery("test")
    const response = await axios.post(this.GRAPHQL_ENDPOINT, {
      query,
    })
    console.log(response.data.data.proposals)
    return response.data.data.proposals
  }

  async getProposalVotes(proposal: Proposal): Promise<ValidatedTask[]> {
    try {
      // Load the GraphQL query from the external file
      const query = await this.loadGraphQLQuery("GetProposalVotes")
      const response = await axios.post(this.GRAPHQL_ENDPOINT, {
        query,
        variables: {
          proposalId: proposal.id,
        },
      })

      let votes = response.data.data.votes

      // Filter out excluded voters
      if (proposal.excludedVoters && proposal.excludedVoters.length > 0) {
        votes = votes.filter((vote: any) => !proposal.excludedVoters!.includes(vote.voter))
      }

      // Filter for rewarded choices if requested
      if (proposal.rewarded && proposal.rewarded.length > 0) {
        const rewardedIndices = proposal.rewarded.map((reward: any) => reward.index)

        votes = votes.filter((vote: any) => {
          const choice = vote.choice
          return Object.entries(choice).some(([option, weight]: [string, any]) => weight > 0 && rewardedIndices.includes(parseInt(option)))
        })
      }

      // Add task validation logic
      const validatedTasks: ValidatedTask[] = []

      if (proposal.organizationRewards && votes.length > 0) {
        for (const vote of votes) {
          const choice = vote.choice

          // Check each vote against organization rewards
          for (const reward of proposal.organizationRewards) {
            const isValidated = this.validateVoteAgainstTask(choice, reward, proposal.rewarded || [])

            if (isValidated) {
              validatedTasks.push({
                task: reward.task,
                value: reward.value,
                validationDate: new Date(vote.created * 1000),
                voterAddress: vote.voter,
                votingPower: vote.vp || 0,
                proposalId: proposal.id,
              })
            }
          }
        }
      }

      return validatedTasks
    } catch (error) {
      console.error("Error fetching proposal votes:", error)
      throw error
    }
  }

  private validateVoteAgainstTask(voteChoice: any, reward: Reward, rewardedChoices: RewardedChoice[]): boolean {
    // Check if the vote choice matches the reward value
    const matchingRewardedChoice = rewardedChoices.find((rc) => rc.choice.includes(reward.value))

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

export default SnapShotVoteService
