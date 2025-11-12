import { Prisma } from "@prisma/client"

import { Proposal } from "../../type/data.js"
import { AbstractRepository } from "../AbstractRepository.js"
import { VotesFromDb } from "../../services/OnChainVoteService.js"

export class UserPointsVoteRepository extends AbstractRepository {
  insertAddresses = async (addresses: Prisma.userCreateInput[]) => {
    if (addresses.length > 0) {
      await this.prismaClient.user.createMany({
        data: addresses,
        skipDuplicates: true,
      })
    }
  }

  async fetchTasks() {
    return await this.prismaClient.vote_task.findMany({
      select: { id: true, name: true, point_rate: true },
    })
  }

  // Takes user addresses and return associated boosts
  async fetchUsersBoosts(addresses: Array<string>) {
    return await this.prismaClient.user_boost.findMany({
      where: {
        user_address: { in: addresses },
        end_at: null,
      },
      select: {
        user_address: true,
        multiplier: true,
      },
    })
  }

  async createUserVoteTasks(userTasks: Prisma.vote_user_tasksCreateManyInput[]) {
    return await this.prismaClient.vote_user_tasks.createMany({
      data: userTasks,
    })
  }

  async getProcessedProposals(ids: Array<string>) {
    return await this.prismaClient.processed_proposal.findMany({
      select: { id: true, proposal_id: true },
      where: { proposal_id: { in: ids } },
    })
  }

  async markProcessedProposals(proposals: Proposal[]) {
    if (proposals.length === 0) return

    const proposalsToInsert = proposals.map((p) => {
      return {
        proposal_id: p.id,
        title: p.title,
      }
    })

    return await this.prismaClient.processed_proposal.createMany({
      data: proposalsToInsert,
    })
  }

  async insertVotesForGauge(votes: Prisma.gauges_votesCreateManyInput[]) {
    await this.prismaClient.gauges_votes.createMany({
      data: votes,
    })
  }

  async getGaugeVoters(): Promise<VotesFromDb[]> {
    return await this.prismaClient.vote_task.findMany({
      where: {
        is_onchain: true,
      },
      select: {
        point_rate: true,
        id: true,
        gauge_pools: {
          select: {
            gauge_controller: {
              select: {
                controller_address: true,
              },
            },
            gauge_address: true,
            gauge_votes: {
              select: {
                user_address: true,
              },
            },
          },
        },
      },
    })
  }

  async getOnChainTaskVotes() {
    return await this.prismaClient.vote_task.findMany({
      where: {
        is_onchain: true,
      },
      select: {
        point_rate: true,
        gauge_pools: {
          select: {
            gauge_address: true,
            gauge_votes: {
              select: {
                user_address: true,
              },
            },
          },
        },
      },
    })
  }

  async getVotersToExclude() {
    return await this.prismaClient.gauge_controllers.findMany({
      select: {
        controller_address: true,
        voter_to_exclude: {
          select: {
            user_address: true,
          },
        },
      },
    })
  }

  async getScoringGauges() {
    return this.prismaClient.gauge_pools.findMany({
      select: {
        gauge_address: true,
        id: true,
      },
    })
  }
}
