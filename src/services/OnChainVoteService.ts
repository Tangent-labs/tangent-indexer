import { formatEther, JsonRpcProvider } from "ethers"
import { Prisma } from "@prisma/client"
import { ONE_WEEK_IN_SECONDS } from "@tangent/defi-resources/build/utils/durations.js"

import { UserPointsVoteRepository } from "../db/Points/UserPointsVoteRepository.js"
import { chainView } from "../utils/chainView.js"
import GetGaugeVotes from "../abis/GetGaugeVotes.json" with { type: "json" }
import { NumMap } from "./boost/types.js"
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
  timestamp: bigint
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

export type TaskVote = {
  id: bigint
  point_rate: number
  gaugePools: {
    gauge_address: string
    gauge_controller: {
      id: bigint
      controller_address: string
    }
    gauge_votes: {
      user_address: string
    }[]
  }
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

    const { paramInChainview, pointRatesPerGauge, taskIdPerGauge, gaugeControllerIdPerControllerAddress } = this.formatDbReturn(currentVoters)
    const newPoints: Prisma.vote_user_tasksCreateManyInput[] = []
    // Take the onchain snapshot containing all balances for tracked token giving boost
    const votingPowers = await this.getOnchainData(paramInChainview, rpcProvider)

    const now = new Date(Number(votingPowers.timestamp.toString()) * 1000)

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
    // Store the new proposals
    const newEpochs: Prisma.votes_epoch_processed_proposalCreateManyInput[] = paramInChainview.map((p) => {
      return {
        epoch_id: this.formatProposalId(p.gaugeController, now),
        processed_at: now,
        epoch_name: this.formatProposalId(p.gaugeController, now),
        gauge_controller_id: gaugeControllerIdPerControllerAddress[p.gaugeController],
      }
    })

    const proposals = await this.userVoteRepository.storeEpochProposal(newEpochs)
    console.log(proposals)

    // For each Gauge controller
    votingPowers.gaugeControllerWeights.forEach((vp, i) => {
      // For each votes into these controllers
      vp.weights.forEach((w, j) => {
        const accountGauge = paramInChainview[i].accountGauges[j]
        const account = accountGauge.account.toLowerCase()
        const gauge = accountGauge.gauge

        const weightInNumber = Number(formatEther(w))
        if (weightInNumber !== 0) {
          // Composite ID created to understand what it is
          const epochKey = vp.gaugeController + " " + now.toString()
          const epochId = proposals.find((p) => {
            return p.epoch_name === epochKey
          })

          if (!epochId) {
            throw new Error(`No epoch id with the key ${epochKey}`)
          }
          const boost = boostPerUser[account] ? boostPerUser[account] : 1

          newPoints.push({
            votes_epoch_processed_proposal_id: epochId.id,
            user_address: account,
            voting_power: weightInNumber,
            vote_task_id: BigInt(taskIdPerGauge[gauge]),
            points: Math.trunc(weightInNumber * pointRatesPerGauge[gauge] * boost),
            date: new Date(Number(votingPowers.timestamp) * 1_000),
          })
        }
      })
    })
    // Insert all the
    await this.userVoteRepository.createUserVoteTasks(newPoints)

    return now
  }

  formatProposalId(gaugeController: string, date: Date) {
    return gaugeController + " " + date.toString()
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
      id: bigint
      point_rate: number
      gaugePools?: {
        gauge_address: string
        gauge_controller: {
          id: bigint
          controller_address: string
        }
        gauge_votes: {
          user_address: string
        }[]
      } | null
    }[]
  ) {
    const paramInChainview: GetGaugeVotesIn[] = []
    const pointRatesPerGauge: NumMap = {}
    const taskIdPerGauge: { [key: string]: string } = {}
    const gaugeControllerIdPerControllerAddress: { [key: string]: number } = {}

    tasks.forEach((task) => {
      if (task.gaugePools) {
        const gp = task.gaugePools
        // Retrieve the taskID and the point rate linked to a gauge
        pointRatesPerGauge[gp.gauge_address] = task.point_rate
        taskIdPerGauge[gp.gauge_address] = task.id.toString()
        const gaugeController = gp.gauge_controller.controller_address

        gaugeControllerIdPerControllerAddress[gaugeController] = Number(task.gaugePools.gauge_controller.id)

        // Iterates over all gauge votes done on all pools
        gp.gauge_votes.forEach((gv) => {
          const gaugeControllerId = paramInChainview.findIndex((p) => {
            return p.gaugeController === gaugeController
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
      }
    })

    return { paramInChainview, pointRatesPerGauge, taskIdPerGauge, gaugeControllerIdPerControllerAddress }
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

  verifyEpochFullyFinished(currentBlockDate: Date, lastEpochDate: Date | undefined) {
    const nowTimestamp = currentBlockDate.getTime()
    if (lastEpochDate) {
      const lastEpochMili = lastEpochDate.getTime()
      const delta = nowTimestamp - (lastEpochMili + ONE_WEEK_IN_SECONDS * 1000)
      if (delta < 0) {
        throw new Error(`Votes point indexer can run only one time per week : ${delta / -1000 / 3600} hours left`)
      }
    }
    const weekId = BigInt(nowTimestamp) / BigInt(ONE_WEEK_IN_SECONDS * 1000)
    const adjustedDate = new Date((Number(weekId) * ONE_WEEK_IN_SECONDS + 3600 * 14) * 1000)
    return adjustedDate
  }
}
