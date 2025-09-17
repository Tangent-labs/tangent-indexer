import { Proposal } from "type/data"
import { AbstractRepository } from "./AbstractRepository"

export class UserVoteRepository extends AbstractRepository {
  async fetchTasks() {
    return await this.prismaClient.vote_task.findMany({
      where: { is_active: true },
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

  async createUserVoteTasks(
    tasks: {
      vote_task_id: bigint
      user_address: string
      proposal_id: string
      validation_at: Date
      voting_power: number
      points: number
    }[]
  ) {
    return await this.prismaClient.vote_user_tasks.createMany({
      data: tasks,
    })
  }

  async getProcessedProposals(ids: Array<bigint>) {
    return await this.prismaClient.processed_proposal.findMany({
      select: { id: true, proposal_id: true },
      where: { id: { in: ids } },
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
}
