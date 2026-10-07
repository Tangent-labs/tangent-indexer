import fs from "fs"
import { Prisma, PrismaClient } from "@prisma/client"

// Convex dropped Snapshot for on-chain votes. Votes are gathered by hand in a CSV:
// Address,R1_USDC,R1_frxUSD,...,R4_OUSD,Total_Tokens
// Usage: tsx src/scripts/db/add-new/add-convex-onchain-vote-user-tasks.ts [csvPath] [--apply]
// Without --apply nothing is written, the rows are only printed.

const ORGANISATION_KEY = "cvx.eth"

// End date of each Convex round (UTC)
const ROUNDS: Record<string, Date | undefined> = {
  R1: new Date("2026-08-18T00:00:00Z"),
  R2: new Date("2026-09-01T00:00:00Z"),
  R3: new Date("2026-09-15T00:00:00Z"),
  R4: new Date("2026-09-29T00:00:00Z"),
}

const prisma = new PrismaClient()

async function main() {
  const apply = process.argv.includes("--apply")
  const csvPath = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "aa.csv"

  const [header, ...lines] = fs.readFileSync(csvPath, "utf-8").trim().split("\n")
  const columns = header.trim().split(",")

  const orga = await prisma.snapshot_organisations.findFirst({ where: { key: ORGANISATION_KEY } })
  if (!orga) throw new Error(`Snapshot organisation not found: ${ORGANISATION_KEY}`)

  const tasks = await prisma.vote_task.findMany({
    where: { organisation: ORGANISATION_KEY },
    select: { id: true, description: true, point_rate: true },
  })

  // Column "R1_frxUSD" -> round "R1", task whose description contains "frxUSD"
  const votes: { round: string; task: (typeof tasks)[number]; user_address: string; voting_power: number }[] = []
  for (const line of lines) {
    const cells = line.trim().split(",")
    const user_address = cells[0].toLowerCase()
    columns.forEach((col, i) => {
      const match = col.match(/^(R\d+)_(.+)$/)
      const voting_power = Number(cells[i])
      if (!match || !voting_power) return

      const [, round, token] = match
      const matchingTasks = tasks.filter((t) => t.description.includes(token))
      if (matchingTasks.length !== 1)
        throw new Error(`Expected 1 ${ORGANISATION_KEY} vote task for "${token}", found: ${matchingTasks.map((t) => t.description).join(" | ") || "none"}`)

      votes.push({ round, task: matchingTasks[0], user_address, voting_power })
    })
  }

  const rounds = Array.from(new Set(votes.map((v) => v.round)))
  const missingDates = rounds.filter((r) => !ROUNDS[r])
  if (missingDates.length) throw new Error(`Missing date for rounds: ${missingDates.join(", ")}`)

  const epochIds = rounds.map((r) => `convex-onchain-${r}`)
  const existing = await prisma.votes_epoch_processed_proposal.findMany({ where: { epoch_id: { in: epochIds } } })
  if (existing.length) throw new Error(`Rounds already inserted: ${existing.map((e) => e.epoch_id).join(", ")}`)

  const boosts = await prisma.user_boost.findMany({
    where: { user_address: { in: votes.map((v) => v.user_address) }, end_at: null },
    select: { user_address: true, multiplier: true },
  })

  // Same points formula as SnapShotVoteService.updateUserVoteTasks
  const rows = votes.map((v) => {
    const multiplier = Number(boosts.find((b) => b.user_address.toLowerCase() === v.user_address)?.multiplier) || 1
    return {
      round: v.round,
      vote_task_id: v.task.id,
      task: v.task.description,
      user_address: v.user_address,
      voting_power: v.voting_power,
      points: Number((v.voting_power * v.task.point_rate * multiplier).toFixed(0)),
      date: ROUNDS[v.round]!,
    }
  })

  console.table(rows.map((r) => ({ ...r, vote_task_id: r.vote_task_id.toString(), date: r.date.toISOString() })))

  if (!apply) {
    console.log("Dry run, nothing written. Re-run with --apply to insert.")
    return
  }

  await prisma.$transaction(async (tx) => {
    const proposals = await tx.votes_epoch_processed_proposal.createManyAndReturn({
      data: rounds.map((r) => ({
        epoch_id: `convex-onchain-${r}`,
        epoch_name: `Convex on-chain gauge vote ${r}`,
        processed_at: ROUNDS[r]!,
        snapshot_organisation_id: orga.id,
      })),
    })

    const data: Prisma.vote_user_tasksCreateManyInput[] = rows.map(({ round, task: _task, ...r }) => ({
      ...r,
      votes_epoch_processed_proposal_id: proposals.find((p) => p.epoch_id === `convex-onchain-${round}`)!.id,
    }))
    await tx.vote_user_tasks.createMany({ data })

    await tx.user.createMany({
      data: Array.from(new Set(rows.map((r) => r.user_address))).map((address) => ({ address })),
      skipDuplicates: true,
    })
  })
  console.log(`Inserted ${rows.length} vote_user_tasks over ${rounds.length} rounds.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
