import { Prisma, PrismaClient } from "@prisma/client"
import { NumMap } from "../../services/boost/types.js"
import { TransactionPrisma } from "../../type/prisma.js"
import { ONCHAIN_TASKS, OFFCHAIN_TASKS } from "./config/config_vote_tasks.js"

export async function seedVoteTasks(prisma: PrismaClient | TransactionPrisma) {
  // Map through snapshot organisation to create vote_task objects
  const offChainVoteTasks = OFFCHAIN_TASKS.map((orga) =>
    orga.scoringChoices.map((sc) => {
      return {
        organisation: orga.orga,
        protocol: orga.orga,
        point_rate: sc.pointRate,
        description: sc.taskDescription,
        url: orga.url,
        is_onchain: false,
      }
    })
  ).flat()

  // Map through snapshot organisation to create vote_task objects
  const onchainTasks = ONCHAIN_TASKS.map((orga) =>
    orga.gauges.map((gauge) => {
      return {
        organisation: orga.orga,
        protocol: orga.orga,
        point_rate: gauge.pointRate,
        description: gauge.taskDescription,
        url: orga.url,
        is_onchain: true,
      }
    })
  ).flat()

  // INSERT VOTE_TASKS
  const voteTask = await prisma.vote_task.createManyAndReturn({
    data: offChainVoteTasks.concat(onchainTasks),
  })

  const voteIdPerDescription: NumMap = voteTask.reduce((acc, current) => {
    return {
      ...acc,
      [current.description]: current.id,
    }
  }, {})

  // INSERT SNAPSHOT ORGANISATIONS

  const snapshotOrgas = await prisma.snapshot_organisations.createManyAndReturn({
    data: OFFCHAIN_TASKS.map((snap) => {
      return {
        key: snap.orga,
        url: snap.url,
        proposal_title_search: snap.title,
      }
    }),
  })

  // INSERT SCORING CHOICES
  await prisma.snapshot_scoring_choices.createMany({
    data: OFFCHAIN_TASKS.map((snap) => {
      const orga = snap.orga
      return snap.scoringChoices.map((choice) => {
        return {
          choice_name: choice.name,
          snapshot_organisation_id: snapshotOrgas.find((o) => o.key === orga)!.id,
          vote_task_id: voteIdPerDescription[choice.taskDescription],
        }
      })
    }).flat(),
  })

  // INSERT VOTER TO EXCLUDE
  await prisma.snapshot_voter_to_exclude.createMany({
    data: OFFCHAIN_TASKS.map((snap) => {
      const orga = snap.orga
      return snap.excludedVoters.map((voter) => {
        return {
          user_address: voter.user_address.toLowerCase(),
          name: voter.name,
          snapshot_organisation_id: snapshotOrgas.find((o) => o.key === orga)!.id,
        }
      })
    }).flat(),
  })

  // INSERT GAUGE_CONTROLLER
  const gaugeControllers = await prisma.gauge_controllers.createManyAndReturn({
    data: ONCHAIN_TASKS.map((a) => {
      return { controller_address: a.controller }
    }),
  })

  const controllerIdPerAddress: NumMap = gaugeControllers.reduce((acc, current) => {
    return {
      ...acc,
      [current.controller_address]: current.id,
    }
  }, {})

  // INSERT VOTER_TO_EXCLUDE PER GAUGE CONTROLLER

  const votersToExclude: Prisma.gauges_voter_to_excludeCreateManyInput[] = ONCHAIN_TASKS.map((t) => {
    return t.votersToExclude.map((v) => {
      return {
        user_address: v.address,
        name: v.name,
        gauge_controllers_id: controllerIdPerAddress[t.controller],
      }
    })
  }).flat()

  await prisma.gauges_voter_to_exclude.createMany({
    data: votersToExclude,
  })

  const gaugePools: Prisma.gauge_poolsCreateManyInput[] = ONCHAIN_TASKS.map((t) => {
    return t.gauges.map((g) => {
      return {
        gauge_address: g.address,
        gauge_controllers_id: controllerIdPerAddress[t.controller],
        vote_task_id: voteIdPerDescription[g.taskDescription],
      }
    })
  }).flat()

  // INSERT GAUGE_POOLS
  await prisma.gauge_pools.createMany({
    data: gaugePools,
  })
}

export type GaugePoolMapping = {
  [gaugePool: string]: { controllerId: number; taskId: number }
}

export function gaugePools(gaugePoolMapping: GaugePoolMapping): Prisma.gauge_poolsCreateManyInput[] {
  const gaugePools: Prisma.gauge_poolsCreateManyInput[] = []

  Object.entries(gaugePoolMapping).forEach(([gaugeAddress, params]) => {
    gaugePools.push({
      gauge_address: gaugeAddress,
      gauge_controllers_id: params.controllerId,
      vote_task_id: params.taskId,
    })
  })

  return gaugePools
}
