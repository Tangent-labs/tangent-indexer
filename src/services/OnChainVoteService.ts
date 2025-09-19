import { UserVoteRepository } from "db/UserVoteRepository"
import { formatEther, JsonRpcProvider } from "ethers"
import { chainView } from "utils/chainView"
import * as GetGaugeVotes from "../abis/GetGaugeVotes.json"
import { NumMap } from "./boost/types"
import { Prisma } from "@prisma/client"
import { BoostRepository } from "db/BoostRepository"
// IN
export type AccountGauge = {
  account: string
  gauge: string
}
export type GetGaugeVotesIn = {
  gaugeController: string
  accountGauges: AccountGauge[]
}

// OUT
export type GetGaugeVotesOut = {
  timestamp: Number
  gaugeControllerWeights: GaugeControllerWeights[]
}

export type GaugeControllerWeights = {
  gaugeController: string
  weights: bigint[]
}

export type GaugeVoteDb = {
  gauge_pools: {
    gauge_votes: {
      user_address: string
    }[]
    gauge_address: string
  }[]
  controller_address: string
}

export class OnChainVoteService {
  userVoteRepository: UserVoteRepository
  boostRepository: BoostRepository
  provider: JsonRpcProvider

  constructor(userVoteRepository: UserVoteRepository, boostRepository: BoostRepository, provider: JsonRpcProvider) {
    this.userVoteRepository = userVoteRepository
    this.boostRepository = boostRepository
    this.provider = provider
  }

  formatDbReturn(
    tasks: {
      gauge_pools: {
        gauge_address: string
        gauge_controller: {
          controller_address: string
        }
        gauge_votes: {
          user_address: string
        }[]
      }[]
      id: bigint
      point_rate: number
    }[]
  ) {
    const paramInChainview: GetGaugeVotesIn[] = []
    const pointRatesPerGauge: NumMap = {}
    const taskIdPerGauge: { [key: string]: string } = {}

    tasks.forEach((task) => {
      task.gauge_pools.forEach((gp) => {
        pointRatesPerGauge[gp.gauge_address] = task.point_rate
        taskIdPerGauge[gp.gauge_address] = task.id.toString()
        gp.gauge_votes.forEach((gv) => {
          const gaugeId = paramInChainview.findIndex((p) => p.gaugeController === gp.gauge_controller.controller_address)
          const accountGauge: AccountGauge = {
            account: gv.user_address,
            gauge: gp.gauge_address,
          }
          if (gaugeId) {
            paramInChainview[gaugeId].accountGauges.push(accountGauge)
          } else {
            paramInChainview.push({ gaugeController: gp.gauge_controller.controller_address, accountGauges: [accountGauge] })
          }
        })
      })
    })

    return { paramInChainview, pointRatesPerGauge, taskIdPerGauge }
  }

  async getBoostPerUser(allScorers: string[]) {
    const boostPerUser: NumMap = (await this.boostRepository.getUsersBoost(allScorers)).reduce((acc, current) => {
      return {
        ...acc,
        [current.user_address]: current.multiplier,
      }
    }, {})

    return boostPerUser
  }

  computeUserVoteTasks = async () => {
    const currentVoters = await this.userVoteRepository.getGaugeVoters()

    const { paramInChainview, pointRatesPerGauge, taskIdPerGauge } = this.formatDbReturn(currentVoters)

    const newPoints: Prisma.vote_user_tasksCreateManyInput[] = []

    // Take the onchain snapshot containing all balances for tracked token giving boost
    const votingPowers = (
      await chainView<[GetGaugeVotesIn[]], [GetGaugeVotesOut]>(
        this.provider,
        GetGaugeVotes.abi,
        GetGaugeVotes.bytecode,
        // Format the params for chainview
        [paramInChainview]
      )
    )[0]

    const now = new Date(votingPowers.timestamp.toString())

    const allScorers: string[] = []
    // Keeps only users that are earning points to be able to fetch only the boosts we want
    votingPowers.gaugeControllerWeights.forEach((vp, i) => {
      vp.weights.forEach((w, j) => {
        if (w !== 0n) {
          allScorers.push(paramInChainview[i].accountGauges[j].account)
        }
      })
    })

    const boostPerUser = await this.getBoostPerUser(allScorers)

    // For each Gauge controller
    votingPowers.gaugeControllerWeights.forEach((vp, i) => {
      // For each votes into these controllers
      vp.weights.forEach((w, j) => {
        const accountGauge = paramInChainview[i].accountGauges[j]
        const account = accountGauge.account.toLowerCase()
        const gauge = accountGauge.gauge
        // Composite ID created to understand what it is
        const proposalId = vp.gaugeController + " " + gauge + " " + now.toString()

        const weightInNumber = Number(formatEther(w))

        newPoints.push({
          proposal_id: proposalId,
          user_address: account,
          voting_power: weightInNumber,
          vote_task_id: BigInt(taskIdPerGauge[gauge]),
          points: weightInNumber * pointRatesPerGauge[gauge] * boostPerUser[account],
        })
      })
    })
    // Insert all the
    await this.userVoteRepository.createUserVoteTasks(newPoints)
  }
}
