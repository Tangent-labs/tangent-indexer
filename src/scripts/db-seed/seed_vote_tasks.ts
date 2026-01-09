import { Prisma, PrismaClient } from "@prisma/client"
import { NumMap } from "../../services/boost/types.js"
import { CONTROLLER_MAPPING } from "../../services/events/VotesEventService.js"
import { TransactionPrisma } from "../../type/prisma.js"

export async function seedVoteTasks(prisma: PrismaClient | TransactionPrisma) {
  // INSERT GAUGE_CONTROLLER
  const gaugeControllers = await prisma.gauge_controllers.createManyAndReturn({
    data: [{ controller_address: CONTROLLER_MAPPING.CRV.controller }, { controller_address: CONTROLLER_MAPPING.FXN.controller }],
  })

  const controllerIdPerAddress: NumMap = gaugeControllers.reduce((acc, current) => {
    return {
      ...acc,
      [current.controller_address]: current.id,
    }
  }, {})

  // INSERT VOTER_TO_EXCLUDE

  const votersToExclude: Prisma.voter_to_excludeCreateManyInput[] = Object.entries(voterToExcludePerControllerId(controllerIdPerAddress)).flatMap(
    ([controllerId, votersToExclude]) => {
      return votersToExclude.map((ve) => {
        return {
          gauge_controllers_id: Number(controllerId),
          user_address: ve,
        }
      })
    }
  )
  await prisma.voter_to_exclude.createMany({
    data: votersToExclude,
  })

  // INSERT VOTE_TASKS
  const voteTask = await prisma.vote_task.createManyAndReturn({
    data: VOTE_TASK_INIT,
  })

  const voteIdPerName: NumMap = voteTask.reduce((acc, current) => {
    return {
      ...acc,
      [current.name]: current.id,
    }
  }, {})

  // INSERT GAUGE_POOLS
  await prisma.gauge_pools.createMany({
    data: gaugePools(controllerIdPerGaugePool(controllerIdPerAddress, voteIdPerName)),
  })

  console.log("Vote_task seeded")
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

export const GAUGE_CONTROLLER_INIT = [{ controller_address: CONTROLLER_MAPPING.CRV.controller }, { controller_address: CONTROLLER_MAPPING.FXN.controller }]

export function controllerIdPerGaugePool(controllerIdPerAddress: NumMap, taskIdPerName: NumMap): GaugePoolMapping {
  return {
    [CONTROLLER_MAPPING.CRV.gauges.USDC_USDf]: { controllerId: controllerIdPerAddress[CONTROLLER_MAPPING.CRV.controller], taskId: taskIdPerName[VOTE_05] },
    [CONTROLLER_MAPPING.CRV.gauges.crvUSD_USDC]: { controllerId: controllerIdPerAddress[CONTROLLER_MAPPING.CRV.controller], taskId: taskIdPerName[VOTE_05] },
    [CONTROLLER_MAPPING.CRV.gauges.crvUSD_USDT]: { controllerId: controllerIdPerAddress[CONTROLLER_MAPPING.CRV.controller], taskId: taskIdPerName[VOTE_06] },
    [CONTROLLER_MAPPING.FXN.gauges.STABILITY_POOL]: { controllerId: controllerIdPerAddress[CONTROLLER_MAPPING.FXN.controller], taskId: taskIdPerName[VOTE_07] },
    [CONTROLLER_MAPPING.FXN.gauges.FXN_ETH]: { controllerId: controllerIdPerAddress[CONTROLLER_MAPPING.FXN.controller], taskId: taskIdPerName[VOTE_07] },
  }
}

export function voterToExcludePerControllerId(controllerIdPerAddress: NumMap): { [controllerId: number]: string[] } {
  return {
    [controllerIdPerAddress[CONTROLLER_MAPPING.CRV.controller]]: ["0XA", "0XB"],
    [controllerIdPerAddress[CONTROLLER_MAPPING.FXN.controller]]: ["0XC", "0XD"],
  }
}

// export const taskNamePerGaugeAddress = {
//   VOTE_05: { controller: "", gaugePools: [CONTROLLER_MAPPING.CRV.gauges.USDC_USDf] },
//   VOTE_06: { gaugePools: [CONTROLLER_MAPPING.CRV.gauges.crvUSD_USDC, CONTROLLER_MAPPING.CRV.gauges.crvUSD_USDT] },
//   VOTE_07: { gaugePools: [CONTROLLER_MAPPING.FXN.gauges.STABILITY_POOL, CONTROLLER_MAPPING.FXN.gauges.cvxFXN_FXN] }
// }

export const VOTE_01 = "VOTE_01"
export const VOTE_02 = "VOTE_02"
export const VOTE_03 = "VOTE_03"
export const VOTE_04 = "VOTE_04"
export const VOTE_05 = "VOTE_05"
export const VOTE_06 = "VOTE_06"
export const VOTE_07 = "VOTE_07"
export const VOTE_12 = "VOTE_12"

export const VOTE_TASK_INIT = [
  {
    name: VOTE_01,
    organisation: "cvx.eth",
    protocol: "Convex",
    point_rate: 1,
    description: "Convex rewarded choice vote",
    url: "https://vote.convexfinance.com/",
    is_onchain: false,
  },
  {
    name: VOTE_02,
    organisation: "cvx.eth",
    protocol: "Convex",
    point_rate: 1,
    description: "Convex rewarded choice vote",
    url: "https://vote.convexfinance.com/",
    is_onchain: false,
  },
  {
    // sdCRV weekly “rewarded choice” votes (sdcrv.eth)
    name: VOTE_03,
    organisation: "sdcrv.eth",
    protocol: "Curve",
    point_rate: 2,
    description: "sdCRV rewarded choice vote",
    url: "https://snapshot.box/#/s:sdcrv.eth",
    is_onchain: false,
  },
  {
    // Optional: participation reward once per proposal (any org)
    name: VOTE_04,
    organisation: "*",
    protocol: "Generic",
    point_rate: 10,
    description: "Flat reward for participating in a proposal (once per proposal)",
    url: "https://hub.snapshot.org",
    is_onchain: false,
  },
  {
    name: VOTE_05,
    description: "Vote on USG-USDC with veCRV",
    is_onchain: true,
    organisation: "CRV",
    point_rate: 12,
    protocol: "CRV",
    url: "https://www.curve.finance/dao/ethereum/gauges",
  },
  {
    name: VOTE_06,
    description: "Vote on USG-USDC with veCRV",
    is_onchain: true,
    organisation: "CRV",
    point_rate: 6,
    protocol: "CRV",
    url: "https://www.curve.finance/dao/ethereum/gauges",
  },
  {
    name: VOTE_07,
    description: "Vote on 1 pool with veFXN",
    is_onchain: true,
    organisation: "FXN",
    point_rate: 10,
    protocol: "FXN",
    url: "https://fx.aladdin.club/gauge/",
  },
  {
    name: VOTE_12,
    description: "Vote on CRV+cvxCRV",
    is_onchain: false,
    organisation: "CRV",
    point_rate: 12,
    protocol: "CRV",
    url: "https://curve.finance",
  },
]
