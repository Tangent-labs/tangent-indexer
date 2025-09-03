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
    rows: {
      vote_task_id: bigint
      user_address: string
      proposal_id: string
      validation_at: Date
      voting_power: number
      rate: number
    }[]
  ) {
    if (!rows.length) return { count: 0 }

    const seen = new Set<string>()
    const pooled = []
    for (const r of rows) {
      const key = `${String(r?.vote_task_id)}|${r?.user_address?.toLowerCase()}|${r.proposal_id}`
      if (seen.has(key)) continue
      seen.add(key)
      pooled.push({
        vote_task_id: BigInt(r.vote_task_id),
        user_address: r?.user_address?.toLowerCase(),
        proposal_id: r.proposal_id,
        validation_at: r.validation_at,
        voting_power: r.voting_power,
        points: r?.voting_power * r?.rate,
      })
    }

    return this.prismaClient.user_vote_tasks.createMany({
      data: pooled,
      skipDuplicates: true,
    })
  }

  async getProcessedProposals() {
    return this.prismaClient.processed_proposal.findMany({
      select: { id: true, proposal_id: true },
    })
  }

  async markProposalsProcessed(proposals: Proposal[]) {
    if (!proposals.length) return { count: 0 }

    const seen = new Set<string>()
    const data = []
    for (const it of proposals) {
      const k = it.id
      if (seen.has(k)) continue
      seen.add(k)
      data.push({ proposal_id: it.id, title: it.title ?? null })
    }

    return this.prismaClient.processed_proposal.createMany({
      data,
      skipDuplicates: true,
    })
  }
}
