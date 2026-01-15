import { Prisma } from "@prisma/client"

import { AbstractRepository } from "../AbstractRepository.js"

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
      select: { id: true, description: true, point_rate: true },
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
    if (userTasks.length === 0) return

    return await this.prismaClient.vote_user_tasks.createMany({
      data: userTasks,
    })
  }

  async getProcessedProposals(epochIds: Array<string>) {
    return await this.prismaClient.votes_epoch_processed_proposal.findMany({
      select: { id: true, epoch_id: true },
      where: { epoch_id: { in: epochIds } },
    })
  }

  async storeEpochProposal(proposals: Prisma.votes_epoch_processed_proposalCreateManyInput[]) {
    if (proposals.length === 0) return []

    return await this.prismaClient.votes_epoch_processed_proposal.createManyAndReturn({ data: proposals })
  }

  async insertVotesForGauge(votes: Prisma.gauges_votesCreateManyInput[]) {
    if (votes.length === 0) return

    await this.prismaClient.gauges_votes.createMany({
      data: votes,
    })
  }

  async getGaugeVoters() {
    return await this.prismaClient.vote_task.findMany({
      where: {
        is_onchain: true,
      },
      select: {
        point_rate: true,
        id: true,
        gaugePools: {
          select: {
            gauge_controller: {
              select: {
                id: true,
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
        gaugePools: {
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

  async getSnapshotOrganisations() {
    return await this.prismaClient.snapshot_organisations.findMany({
      select: {
        id: true,
        proposal_title_search: true,
        url: true,
        key: true,
        votersToExclude: true,
        scoringChoices: true,
      },
    })
  }

  async getTrackedGaugeControllers() {
    return await this.prismaClient.gauge_controllers.findMany({
      select: {
        controller_address: true,
      },
    })
  }
}
