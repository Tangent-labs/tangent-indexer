import { UserPointsVoteRepository } from "../db/Points/UserPointsVoteRepository.js"
import { formatEther, JsonRpcProvider } from "ethers"
import { chainView } from "../utils/chainView.js"
import GetGaugeVotes from "../abis/GetGaugeVotes.json" with { type: "json" }
import { NumMap } from "./boost/types.js"
import { Prisma } from "@prisma/client"
import { BoostRepository } from "../db/Points/BoostRepository.js"
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
export type GaugeControllerWeights = {
  gaugeController: string
  weights: bigint[]
}

export type GetGaugeVotesOut = {
  timestamp: Number
  gaugeControllerWeights: GaugeControllerWeights[]
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

export type VotesFromDb = {
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
}

export class OnChainVoteService {
  userVoteRepository: UserPointsVoteRepository
  boostRepository: BoostRepository
  provider: JsonRpcProvider

  constructor(userVoteRepository: UserPointsVoteRepository, boostRepository: BoostRepository, provider: JsonRpcProvider) {
    this.userVoteRepository = userVoteRepository
    this.boostRepository = boostRepository
    this.provider = provider
  }

  computeUserVoteTasks = async (rpcProvider: JsonRpcProvider) => {
    const currentVoters = await this.userVoteRepository.getGaugeVoters()

    const { paramInChainview, pointRatesPerGauge, taskIdPerGauge } = this.formatDbReturn(currentVoters)

    const newPoints: Prisma.vote_user_tasksCreateManyInput[] = []

    // Take the onchain snapshot containing all balances for tracked token giving boost
    const votingPowers = await this.getOnchainData(paramInChainview, rpcProvider)
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

        const boost = boostPerUser[account] ? boostPerUser[account] : 1
        newPoints.push({
          proposal_id: proposalId,
          user_address: account,
          voting_power: weightInNumber,
          vote_task_id: BigInt(taskIdPerGauge[gauge]),
          points: Math.trunc(weightInNumber * pointRatesPerGauge[gauge] * boost),
        })
      })
    })
    // Insert all the
    await this.userVoteRepository.createUserVoteTasks(newPoints)
  }

  async getOnchainData(paramInChainview: GetGaugeVotesIn[], rpcProvider: JsonRpcProvider) {
    const votingPowers = (
      await chainView<[GetGaugeVotesIn[]], [GetGaugeVotesOut]>(
        rpcProvider,
        GetGaugeVotes.abi,
        GetGaugeVotes.bytecode,
        // Format the params for chainview
        [paramInChainview]
      )
    )[0]

    return votingPowers
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
        // Retrieve the taskID and the point rate linked to a gauge
        pointRatesPerGauge[gp.gauge_address] = task.point_rate
        taskIdPerGauge[gp.gauge_address] = task.id.toString()

        // Iterates over all gauge votes done on all pools
        gp.gauge_votes.forEach((gv) => {
          const gaugeControllerId = paramInChainview.findIndex((p) => {
            return p.gaugeController === gp.gauge_controller.controller_address
          })

          const accountGauge: AccountGauge = {
            account: gv.user_address,
            gauge: gp.gauge_address,
          }

          if (gaugeControllerId !== -1) {
            paramInChainview[gaugeControllerId].accountGauges.push(accountGauge)
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
}
