import { Prisma, PrismaClient } from "@prisma/client"
import { NumMap } from "../../services/boost/types.js"
import { TransactionPrisma } from "../../type/prisma.js"

export const VOTE_TASK_DESCRIPTION = {
  CVX_ON_USG_USDC: "Vote on USG-USDC on CVX snapshot",
  CVX_ON_USG_frxUSD: "Vote on USG-frxUSD on CVX snapshot",
  CVX_ON_USG_wcrvUSD: "Vote on USG-wcrvUSD on CVX snapshot",
  CVX_ON_USG_wUSDe: "Vote on USG-USDe on CVX snapshot",

  SDCRV_ON_USG_USDC: "Vote on USG-USDC on sdCRV snapshot",
  SDCRV_ON_USG_frxUSD: "Vote on USG-frxUSD on sdCRV snapshot",
  SDCRV_ON_USG_wcrvUSD: "Vote on USG-wcrvUSD on sdCRV snapshot",

  VECRV_ON_USG_USDC: "Vote on USG-USDC on veCRV gauge",
  VECRV_ON_USG_frxUSD: "Vote on USG-frxUSD on veCRV gauge",
  VECRV_ON_USG_wcrvUSD: "Vote on USG-wcrvUSD on veCRV gauge",
  VEFXN_ON_USG_fxUSD: "Vote on USG-fxUSD on veCRV gauge",
}

export const GAUGE_CONTROLLER_MAPPING: {
  [gaugeControllerKey: string]: {
    controller: string
    gauges: {
      [gaugeKey: string]: string
    }
  }
} = {
  CRV: {
    controller: "0x2F50D538606Fa9EDD2B11E2446BEb18C9D5846bB".toLowerCase(),
    gauges: {
      USDC_USDf: "0x156527deF9a2AB4F54C849575f23dC4BB439d9d9".toLowerCase(),
      crvUSD_USDC: "0x95f00391cB5EebCd190EB58728B4CE23DbFa6ac1".toLowerCase(),
      crvUSD_USDT: "0x4e6bB6B7447B7B2Aa268C16AB87F4Bb48BF57939".toLowerCase(),
    },
  },
  FXN: {
    controller: "0xe60eB8098B34eD775ac44B1ddE864e098C6d7f37".toLowerCase(),
    gauges: {
      STABILITY_POOL: "0x215D87bd3c7482E2348338815E059DE07Daf798A".toLowerCase(),
      FXN_ETH: "0xA5250C540914E012E22e623275E290c4dC993D11".toLowerCase(),
    },
  },
}

export const SNAPSHOT_ORGANISATIONS = [
  {
    orga: "cvx.eth",
    url: "https://vote.convexfinance.com/",
    title: "Gauge Weight for Week",
    scoringChoices: [
      { taskDescription: VOTE_TASK_DESCRIPTION.CVX_ON_USG_USDC, name: "crvUSD+USD0" },
      { taskDescription: VOTE_TASK_DESCRIPTION.CVX_ON_USG_frxUSD, name: "MIM+3CRV" },
      { taskDescription: VOTE_TASK_DESCRIPTION.CVX_ON_USG_wcrvUSD, name: "WETH+CVX" },
      { taskDescription: VOTE_TASK_DESCRIPTION.CVX_ON_USG_wUSDe, name: "CRV+cvxCRV" },
    ],
    // TODO Exclude voters to add
    excludedVoters: ["0x0000000000000000000000000000000000000000", "0x1111111111111111111111111111111111111111"],
  },
  {
    orga: "sdcrv.eth",
    url: "https://snapshot.box/#/s:sdcrv.eth",
    title: "Gauge vote CRV",
    scoringChoices: [
      { taskDescription: VOTE_TASK_DESCRIPTION.SDCRV_ON_USG_USDC, name: "crvUSD+USD0" },
      { taskDescription: VOTE_TASK_DESCRIPTION.SDCRV_ON_USG_frxUSD, name: "ETH++WETH" },
    ],
    // TODO Exclude voters to add
    excludedVoters: ["0x2222222222222222222222222222222222222222"],
  },
]

export async function seedVoteTasks(prisma: PrismaClient | TransactionPrisma) {
  // INSERT VOTE_TASKS
  const voteTask = await prisma.vote_task.createManyAndReturn({
    data: ONCHAIN_VOTE_TASK_INIT.concat(OFFCHAIN_VOTE_TASK_INIT),
  })

  const voteIdPerDescription: NumMap = voteTask.reduce((acc, current) => {
    return {
      ...acc,
      [current.description]: current.id,
    }
  }, {})

  // INSERT SNAPSHOT ORGANISATIONS

  const snapshotOrgas = await prisma.snapshot_organisations.createManyAndReturn({
    data: SNAPSHOT_ORGANISATIONS.map((snap) => {
      return {
        key: snap.orga,
        url: snap.url,
        proposal_title_search: snap.title,
      }
    }),
  })

  // INSERT SCORING CHOICES
  await prisma.snapshot_scoring_choices.createMany({
    data: SNAPSHOT_ORGANISATIONS.map((snap) => {
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
    data: SNAPSHOT_ORGANISATIONS.map((snap) => {
      const orga = snap.orga
      return snap.excludedVoters.map((voter) => {
        return {
          user_address: voter,
          snapshot_organisation_id: snapshotOrgas.find((o) => o.key === orga)!.id,
        }
      })
    }).flat(),
  })

  // INSERT GAUGE_CONTROLLER
  const gaugeControllers = await prisma.gauge_controllers.createManyAndReturn({
    data: [{ controller_address: GAUGE_CONTROLLER_MAPPING.CRV.controller }, { controller_address: GAUGE_CONTROLLER_MAPPING.FXN.controller }],
  })

  const controllerIdPerAddress: NumMap = gaugeControllers.reduce((acc, current) => {
    return {
      ...acc,
      [current.controller_address]: current.id,
    }
  }, {})

  // INSERT VOTER_TO_EXCLUDE PER GAUGE CONTROLLER

  const votersToExclude: Prisma.gauges_voter_to_excludeCreateManyInput[] = Object.entries(voterToExcludePerControllerId(controllerIdPerAddress)).flatMap(
    ([controllerId, votersToExclude]) => {
      return votersToExclude.map((ve) => {
        return {
          gauge_controllers_id: Number(controllerId),
          user_address: ve,
        }
      })
    }
  )
  await prisma.gauges_voter_to_exclude.createMany({
    data: votersToExclude,
  })

  // INSERT GAUGE_POOLS
  await prisma.gauge_pools.createMany({
    data: gaugePools(controllerIdPerGaugePool(controllerIdPerAddress, voteIdPerDescription)),
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

export const GAUGE_CONTROLLER_INIT = [
  { controller_address: GAUGE_CONTROLLER_MAPPING.CRV.controller },
  { controller_address: GAUGE_CONTROLLER_MAPPING.FXN.controller },
]

export function controllerIdPerGaugePool(controllerIdPerAddress: NumMap, taskIdPerDescription: NumMap): GaugePoolMapping {
  return {
    [GAUGE_CONTROLLER_MAPPING.CRV.gauges.USDC_USDf]: {
      controllerId: controllerIdPerAddress[GAUGE_CONTROLLER_MAPPING.CRV.controller],
      taskId: taskIdPerDescription[VOTE_TASK_DESCRIPTION.VECRV_ON_USG_USDC],
    },
    [GAUGE_CONTROLLER_MAPPING.CRV.gauges.crvUSD_USDC]: {
      controllerId: controllerIdPerAddress[GAUGE_CONTROLLER_MAPPING.CRV.controller],
      taskId: taskIdPerDescription[VOTE_TASK_DESCRIPTION.VECRV_ON_USG_frxUSD],
    },
    [GAUGE_CONTROLLER_MAPPING.CRV.gauges.crvUSD_USDT]: {
      controllerId: controllerIdPerAddress[GAUGE_CONTROLLER_MAPPING.CRV.controller],
      taskId: taskIdPerDescription[VOTE_TASK_DESCRIPTION.VECRV_ON_USG_wcrvUSD],
    },
    [GAUGE_CONTROLLER_MAPPING.FXN.gauges.STABILITY_POOL]: {
      controllerId: controllerIdPerAddress[GAUGE_CONTROLLER_MAPPING.FXN.controller],
      taskId: taskIdPerDescription[VOTE_TASK_DESCRIPTION.VEFXN_ON_USG_fxUSD],
    },
  }
}

export function voterToExcludePerControllerId(controllerIdPerAddress: NumMap): { [controllerId: number]: string[] } {
  return {
    [controllerIdPerAddress[GAUGE_CONTROLLER_MAPPING.CRV.controller]]: ["0XA", "0XB"],
    [controllerIdPerAddress[GAUGE_CONTROLLER_MAPPING.FXN.controller]]: ["0XC", "0XD"],
  }
}

export const OFFCHAIN_VOTE_TASK_INIT: Prisma.vote_taskCreateManyInput[] = [
  // CVX
  {
    organisation: "cvx.eth",
    protocol: "Convex",
    point_rate: 1,
    description: VOTE_TASK_DESCRIPTION.CVX_ON_USG_USDC,
    url: "https://vote.convexfinance.com/",
    is_onchain: false,
  },
  {
    organisation: "cvx.eth",
    protocol: "Convex",
    point_rate: 1,
    description: VOTE_TASK_DESCRIPTION.CVX_ON_USG_frxUSD,
    url: "https://vote.convexfinance.com/",
    is_onchain: false,
  },
  {
    organisation: "cvx.eth",
    protocol: "Convex",
    point_rate: 1,
    description: VOTE_TASK_DESCRIPTION.CVX_ON_USG_wcrvUSD,
    url: "https://vote.convexfinance.com/",
    is_onchain: false,
  },
  {
    organisation: "cvx.eth",
    protocol: "Convex",
    point_rate: 1,
    description: VOTE_TASK_DESCRIPTION.CVX_ON_USG_wUSDe,
    url: "https://vote.convexfinance.com/",
    is_onchain: false,
  },

  // STAKEDAO CRV
  {
    organisation: "sdcrv.eth",
    protocol: "StakeDao",
    point_rate: 2,
    description: VOTE_TASK_DESCRIPTION.SDCRV_ON_USG_USDC,
    url: "https://snapshot.box/#/s:sdcrv.eth",
    is_onchain: false,
  },
  {
    organisation: "sdcrv.eth",
    protocol: "StakeDao",
    point_rate: 2,
    description: VOTE_TASK_DESCRIPTION.SDCRV_ON_USG_frxUSD,
    url: "https://snapshot.box/#/s:sdcrv.eth",
    is_onchain: false,
  },
  {
    organisation: "sdcrv.eth",
    protocol: "StakeDao",
    point_rate: 2,
    description: VOTE_TASK_DESCRIPTION.SDCRV_ON_USG_wcrvUSD,
    url: "https://snapshot.box/#/s:sdcrv.eth",
    is_onchain: false,
  },
]

export const ONCHAIN_VOTE_TASK_INIT: Prisma.vote_taskCreateManyInput[] = [
  {
    description: VOTE_TASK_DESCRIPTION.VECRV_ON_USG_USDC,
    is_onchain: true,
    organisation: "CRV",
    point_rate: 6,
    protocol: "CRV",
    url: "https://www.curve.finance/dao/ethereum/gauges",
  },
  {
    description: VOTE_TASK_DESCRIPTION.VECRV_ON_USG_frxUSD,
    is_onchain: true,
    organisation: "CRV",
    point_rate: 12,
    protocol: "CRV",
    url: "https://curve.finance",
  },
  {
    description: VOTE_TASK_DESCRIPTION.VECRV_ON_USG_wcrvUSD,
    is_onchain: true,
    organisation: "CRV",
    point_rate: 12,
    protocol: "CRV",
    url: "https://curve.finance",
  },
  {
    description: VOTE_TASK_DESCRIPTION.VEFXN_ON_USG_fxUSD,
    is_onchain: true,
    organisation: "FXN",
    point_rate: 10,
    protocol: "FXN",
    url: "https://fx.aladdin.club/gauge/",
  },
]
