import { Prisma, PrismaClient } from "@prisma/client"
import { TransactionPrisma } from "../../../type/prisma.js"
import { CURVE_GLOBAL_CONTRACTS } from "@tangent/defi-resources"
import { CURVE_GAUGE_URL } from "../config/config_vote_tasks.js"

const prisma = new PrismaClient()

// New Curve pools to reward, each on the 3 venues: veCRV (on-chain), sdCRV and vlCVX (snapshot).
// `snapshotChoice` must match the Curve gauge name as displayed in the snapshot proposal choices.
const NEW_POOLS = [
  { name: "USG/msUSD", snapshotChoice: "USG+msUSD", gauge: "0x65b8b0b7d62bdca3ed3c3002c49db315b0f8eb37" },
  { name: "OUSD/USG", snapshotChoice: "OUSD+USG", gauge: "0x512bc2aee29f8e641f903b339d40947595a5bfe8" },
  { name: "sUSG/reUSD", snapshotChoice: "sUSG+reUSD", gauge: "0xc58fb163359b8e53c628868ba6c9335d1a6fd16b" },
]

const VE_CRV_POINT_RATE = 1
const SD_CRV_POINT_RATE = 2
const VL_CVX_POINT_RATE = 20

async function main() {
  await prisma.$transaction(async (tx) => {
    await addCurveGaugeVoteTask(
      tx as TransactionPrisma,
      NEW_POOLS.map((p) => ({
        taskDescription: `Vote for ${p.name} Curve gauge (on-chain)`,
        name: p.name,
        address: p.gauge.toLowerCase(),
        pointRate: VE_CRV_POINT_RATE,
      }))
    )

    await addSnapshotVoteTask(
      tx as TransactionPrisma,
      "sdcrv.eth",
      NEW_POOLS.map((p) => ({
        taskDescription: `Vote for ${p.name} Curve gauge (sdCRV snapshot)`,
        choiceName: p.snapshotChoice,
        pointRate: SD_CRV_POINT_RATE,
      }))
    )

    await addSnapshotVoteTask(
      tx as TransactionPrisma,
      "cvx.eth",
      NEW_POOLS.map((p) => ({
        taskDescription: `Vote for ${p.name} Curve gauge (vlCVX snapshot)`,
        choiceName: p.snapshotChoice,
        pointRate: VL_CVX_POINT_RATE,
      }))
    )
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

async function addCurveGaugeVoteTask(prisma: TransactionPrisma, newTasks: { taskDescription: string; name: string; address: string; pointRate: number }[]) {
  const curveGaugeController = (
    await prisma.gauge_controllers.findFirst({
      where: {
        controller_address: CURVE_GLOBAL_CONTRACTS.GAUGE_CONTROLLER.toLowerCase(),
      },
    })
  )?.id!

  await assertNewDescriptions(
    prisma,
    newTasks.map((t) => t.taskDescription)
  )

  // INSERT VOTE_TASKS
  const voteTask = await prisma.vote_task.createManyAndReturn({
    data: newTasks.map((n) => {
      return {
        organisation: "CRV",
        protocol: "CRV",
        point_rate: n.pointRate,
        description: n.taskDescription,
        url: CURVE_GAUGE_URL,
        is_onchain: true,
      }
    }),
  })

  const gaugePools: Prisma.gauge_poolsCreateManyInput[] = voteTask.map((t) => {
    return {
      vote_task_id: t.id,
      gauge_address: newTasks.find((nT) => t.description === nT.taskDescription)?.address!,
      gauge_controllers_id: curveGaugeController,
    }
  })

  // INSERT GAUGE_POOLS
  await prisma.gauge_pools.createMany({
    data: gaugePools,
  })
}

async function addSnapshotVoteTask(
  prisma: TransactionPrisma,
  organisationKey: string,
  newTasks: { taskDescription: string; choiceName: string; pointRate: number }[]
) {
  const snapshotOrga = await prisma.snapshot_organisations.findFirst({
    where: { key: organisationKey },
  })

  if (!snapshotOrga) throw new Error(`Snapshot organisation not found: ${organisationKey}`)

  await assertNewDescriptions(
    prisma,
    newTasks.map((t) => t.taskDescription)
  )

  // INSERT VOTE_TASKS
  const voteTask = await prisma.vote_task.createManyAndReturn({
    data: newTasks.map((n) => {
      return {
        organisation: snapshotOrga.key,
        protocol: snapshotOrga.key,
        point_rate: n.pointRate,
        description: n.taskDescription,
        url: snapshotOrga.url,
        is_onchain: false,
      }
    }),
  })

  // INSERT SCORING CHOICES
  await prisma.snapshot_scoring_choices.createMany({
    data: voteTask.map((t) => {
      return {
        choice_name: newTasks.find((nT) => t.description === nT.taskDescription)?.choiceName!,
        snapshot_organisation_id: snapshotOrga.id,
        vote_task_id: t.id,
      }
    }),
  })
}

// Descriptions are the join key used to map tasks back to gauges / scoring choices, so they must stay unique.
async function assertNewDescriptions(prisma: TransactionPrisma, descriptions: string[]) {
  const existing = await prisma.vote_task.findMany({
    where: { description: { in: descriptions } },
    select: { description: true },
  })

  if (existing.length > 0) throw new Error(`Vote tasks already exist: ${existing.map((e) => e.description).join(", ")}`)
}
