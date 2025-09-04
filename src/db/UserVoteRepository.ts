import { Proposal } from "type/data"
import { AbstractRepository } from "./AbstractRepository"

export class UserVoteRepository extends AbstractRepository {
  async fetchTasks() {
    return this.prismaClient.vote_task.findMany({
      where: { is_active: true },
      select: { id: true, name: true, point_rate: true, unit: true },
    })
  }

  async createUserVoteTasks(
    tasks: {
      vote_task_id: bigint
      user_address: string
      proposal_id: string
      validation_at: Date
      voting_power: number
      rate: number
    }[]
  ) {
    if (tasks.length === 0) return { count: 0 }

    const uniqueTaskKeys = new Set<string>()
    const uniqueVoteTasks = []

    for (const task of tasks) {
      const deduplicatedKey = `${String(task.vote_task_id)}|${task.user_address.toLowerCase()}|${task.proposal_id}`
      if (uniqueTaskKeys.has(deduplicatedKey)) continue

      uniqueTaskKeys.add(deduplicatedKey)

      uniqueVoteTasks.push({
        vote_task_id: BigInt(task.vote_task_id),
        user_address: task.user_address.toLowerCase(),
        proposal_id: task.proposal_id,
        validation_at: task.validation_at,
        voting_power: task.voting_power,
        points: task.voting_power * task.rate,
      })
    }

    return this.prismaClient.user_vote_tasks.createMany({
      data: uniqueVoteTasks,
      skipDuplicates: true,
    })
  }

  async getProcessedProposals() {
    return this.prismaClient.processed_proposal.findMany({
      select: { id: true, proposal_id: true },
    })
  }

  async markProposalsProcessed(proposals: Proposal[]) {
    if (proposals.length === 0) return

    const uniqueProposalIds = new Set<string>()
    const proposalsToInsert = []

    for (const proposal of proposals) {
      if (uniqueProposalIds.has(proposal.id)) continue

      uniqueProposalIds.add(proposal.id)
      proposalsToInsert.push({
        proposal_id: proposal.id,
        title: proposal.title ?? null,
      })
    }

    return this.prismaClient.processed_proposal.createMany({
      data: proposalsToInsert,
      skipDuplicates: true,
    })
  }
}
