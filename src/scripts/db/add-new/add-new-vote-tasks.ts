import { Prisma, PrismaClient } from "@prisma/client"
import { CURVE_CONTEXT } from "@tangent/defi-resources/build/ressources/mappings/curveContext.js"
import { TransactionPrisma } from "../../../type/prisma.js"
import { CURVE_GLOBAL_CONTRACTS } from "@tangent/defi-resources"
import { CURVE_GAUGE_URL } from "../config/config_vote_tasks.js"

const prisma = new PrismaClient()

async function main() {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await addCurveGaugeVoteTask(tx, [
      {
        taskDescription: "crvUSD/frxUSD on veCRV gauge",
        name: "crvUSD/frxUSD",
        address: CURVE_CONTEXT.frxUSD_crvUSD.curveGauge.toLowerCase(),
        pointRate: 7.5,
      },
      // {
      //   taskDescription: "DOLA/sUSDS on veCRV gauge",
      //   name: "DOLA/sUSDS",
      //   address: CURVE_CONTEXT.DOLA_sUSDS.curveGauge.toLowerCase(),
      //   pointRate: 10,
      // },
    ])
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
