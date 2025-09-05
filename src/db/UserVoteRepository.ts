import { Proposal } from "type/data"
import { AbstractRepository } from "./AbstractRepository"

export class UserVoteRepository extends AbstractRepository {
  async fetchTasks() {
    return await this.prismaClient.vote_task.findMany({
      where: { is_active: true },
      select: { id: true, name: true, point_rate: true },
    })
  }

  // Takes user addresses and return a map with associated boost
  async fetchBoosts(addresses: Array<string>) {
    const boosts = await this.prismaClient.user_boost.findMany({
      where: {
        user_address: { in: addresses },
        end_at: null,
      },
      select: {
        user_address: true,
        multiplier: true,
      },
    })

    const boostByUser = new Map<string, number>()
    for (const b of boosts) {
      boostByUser.set(b.user_address.toLowerCase(), Number(b.multiplier))
    }

    return boostByUser
  }

  async createUserVoteTasks(
    tasks: {
      vote_task_id: bigint | number | string
      user_address: string
      proposal_id: string
      validation_at: Date
      voting_power: number
      rate: number
    }[]
  ) {
    if (!tasks?.length) return

    // Get unique addresses
    const addresses = Array.from(new Set(tasks.map((t) => t.user_address.toLowerCase())))

    // Get each users boost
    const boostByUser = await this.fetchBoosts(addresses)

    // Build object to insert in user_vote_tasks
    const rows = tasks.map((t) => {
      const voteTaskId = typeof t.vote_task_id === "bigint" ? t.vote_task_id : BigInt(String(t.vote_task_id))
      const user = t.user_address.toLowerCase()
      const multiplier = boostByUser.get(user) ?? 1

      const points = Number(t.voting_power.toFixed(0)) * t.rate * multiplier

      return {
        vote_task_id: voteTaskId,
        user_address: user,
        proposal_id: t.proposal_id,
        validation_at: t.validation_at,
        voting_power: t.voting_power,
        points,
      }
    })

    return this.prismaClient.user_vote_tasks.createMany({
      data: rows,
    })
  }

  async getProcessedProposals() {
    return await this.prismaClient.processed_proposal.findMany({
      select: { id: true, proposal_id: true },
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
