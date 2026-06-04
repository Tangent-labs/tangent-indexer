import { Prisma, PrismaClient } from "@prisma/client"
import { CURVE_GAUGES, CURVE_GLOBAL_CONTRACTS } from "@tangent/defi-resources"
import { TransactionPrisma } from "../../../type/prisma.js"
import { CURVE_GAUGE_URL, OFFCHAIN_TASKS } from "../config/config_vote_tasks.js"

const prisma = new PrismaClient()

// Substring matched against snapshot proposal choices (see SnapShotVoteService)
const SNAPSHOT_CHOICE_NAME = "sDOLA+USG"

// On-chain veCRV gauge vote (same rate as the other USG pools)
const ONCHAIN_TASK = {
  organisation: "CRV",
  description: "Vote for USG/sDOLA Curve gauge (on-chain)",
  pointRate: 1,
  gaugeAddress: CURVE_GAUGES.USG_sDOLA.toLowerCase(),
}

// Off-chain snapshot votes (same rates as the other USG pools)
const OFFCHAIN_VOTE_TASKS = [
  { orgaKey: "sdcrv.eth", description: "Vote for USG/sDOLA Curve gauge (snapshot)", pointRate: 2 },
  { orgaKey: "cvx.eth", description: "Vote for USG/sDOLA on Curve Gauge (snapshot)", pointRate: 20 },
]

async function main() {
  await prisma.$transaction(async (tx) => {
    await addUsgSdolaVoteTasks(tx as TransactionPrisma)
  })
}

async function addUsgSdolaVoteTasks(prisma: TransactionPrisma) {
  // Resolve the existing CRV gauge controller (on-chain task)
  const curveGaugeController = (
    await prisma.gauge_controllers.findFirst({
      where: { controller_address: CURVE_GLOBAL_CONTRACTS.GAUGE_CONTROLLER.toLowerCase() },
    })
  )?.id
  if (!curveGaugeController) {
    throw new Error("CRV gauge controller not found, seed the DB first")
  }

  // Resolve the existing snapshot organisations (off-chain tasks)
  const orgaKeys = OFFCHAIN_VOTE_TASKS.map((t) => t.orgaKey)
  const snapshotOrgas = await prisma.snapshot_organisations.findMany({
    where: { key: { in: orgaKeys } },
  })
  const orgaIdByKey = new Map(snapshotOrgas.map((o) => [o.key, o.id]))
  const urlByKey = new Map(OFFCHAIN_TASKS.map((o) => [o.orga, o.url]))
  for (const key of orgaKeys) {
    if (!orgaIdByKey.has(key)) {
      throw new Error(`Snapshot organisation "${key}" not found, seed the DB first`)
    }
  }

  // INSERT VOTE_TASKS
  const voteTasks = await prisma.vote_task.createManyAndReturn({
    data: [
      {
        organisation: ONCHAIN_TASK.organisation,
        protocol: ONCHAIN_TASK.organisation,
        point_rate: ONCHAIN_TASK.pointRate,
        description: ONCHAIN_TASK.description,
        url: CURVE_GAUGE_URL,
        is_onchain: true,
      },
      ...OFFCHAIN_VOTE_TASKS.map((t) => ({
        organisation: t.orgaKey,
        protocol: t.orgaKey,
        point_rate: t.pointRate,
        description: t.description,
        url: urlByKey.get(t.orgaKey)!,
        is_onchain: false,
      })),
    ],
  })
  const taskIdByDescription = new Map(voteTasks.map((t) => [t.description, t.id]))

  // INSERT GAUGE_POOLS (on-chain task)
  const onchainGaugePool: Prisma.gauge_poolsCreateManyInput = {
    vote_task_id: taskIdByDescription.get(ONCHAIN_TASK.description)!,
    gauge_address: ONCHAIN_TASK.gaugeAddress,
    gauge_controllers_id: curveGaugeController,
  }
  await prisma.gauge_pools.createMany({ data: [onchainGaugePool] })

  // INSERT SNAPSHOT SCORING CHOICES (off-chain tasks)
  const scoringChoices: Prisma.snapshot_scoring_choicesCreateManyInput[] = OFFCHAIN_VOTE_TASKS.map((t) => ({
    choice_name: SNAPSHOT_CHOICE_NAME,
    snapshot_organisation_id: orgaIdByKey.get(t.orgaKey)!,
    vote_task_id: taskIdByDescription.get(t.description)!,
  }))
  await prisma.snapshot_scoring_choices.createMany({ data: scoringChoices })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
