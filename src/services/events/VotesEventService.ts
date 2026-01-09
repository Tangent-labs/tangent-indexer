import { ethers, id, JsonRpcProvider, Log } from "ethers"

import { UserPointsVoteRepository } from "../../db/Points/UserPointsVoteRepository.js"

import { VOTE_FOR_GAUGE } from "../../resources/eventSignatures.js"
import { NumMap } from "../../services/boost/types.js"
import { getEthLogs } from "../../eventFectcher/_baseFetcher.js"
import { CONTROLLER_MAPPING } from "src/scripts/db-seed/seed_vote_tasks.js"

type ParsedVote = {
  gauge_controller: string
  timestamp: Date
  user_address: string
  gauge_pool: string
}

export class VotesEventService {
  constructor(voteRepository: UserPointsVoteRepository) {
    this.voteRepository = voteRepository
  }

  voteRepository: UserPointsVoteRepository
  gaugeControllers = [CONTROLLER_MAPPING.CRV.controller, CONTROLLER_MAPPING.FXN.controller]

  async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
    // TODO Fetch dynamically in db the gauge controllers
    // Fetch logs from the gauge controllerts
    const voteLogs = await getEthLogs(provider, startingBlock, endingBlock, this.gaugeControllers, [id(VOTE_FOR_GAUGE)])

    if (voteLogs.length) {
      // Format all raw logs from the blockchain
      const votes = voteLogs.map((log) => this.parseVoteEvent(log))

      // Retrieve in database all gauges that are scoring and their associated ID
      const scoringGauges = await this.voteRepository.getScoringGauges()
      // Retrieve in db all voters excluded
      const votersToExclude = await this.voteRepository.getVotersToExclude()

      // Format in string[] to get the list of all gauges scoring points
      const scoringGaugesAddresses = scoringGauges.map((sg) => sg.gauge_address)

      const voterToExcludePerGaugeController: { [key: string]: string[] } = votersToExclude.reduce((acc, current) => {
        return {
          ...acc,
          [current.controller_address.toLocaleLowerCase()]: current.voter_to_exclude?.map((ve) => ve.user_address),
        }
      }, {})

      // Remove all votes not done on gauges that are NOT scoring points
      const sortedVotes = votes.filter((sv) => {
        const isItATrackedGauge = scoringGaugesAddresses.includes(sv.gauge_pool.toLowerCase())
        // If the gauge is not tracked, we don't need to store this event
        if (!isItATrackedGauge) {
          return false
        }

        const votersToExclude = voterToExcludePerGaugeController[sv.gauge_controller.toLowerCase()]
        const isExcluded = votersToExclude.find((v) => v === sv.user_address.toLowerCase())
        // If the voter is not excluded from the current gauge controller, we store the vote
        if (!isExcluded) {
          return true
        }
        return false
      })

      // Get a NumMap of the gauge ID per gauge address
      const gaugeIdPerAddress: NumMap = scoringGauges.reduce((acc, current) => {
        return {
          ...acc,
          [current.gauge_address]: current.id,
        }
      }, {})

      await this.voteRepository.insertVotesForGauge(
        sortedVotes.map((v) => ({ gauge_pool_id: gaugeIdPerAddress[v.gauge_pool.toLowerCase()], user_address: v.user_address }))
      )
    }
  }

  parseVoteEvent(log: Log): ParsedVote {
    // all events have the same signature
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "address", "address", "uint256"], log.data)

    return {
      gauge_controller: log.address,
      timestamp: new Date(Number(decoded[0])),
      user_address: decoded[1],
      gauge_pool: decoded[2],
    }
  }
}
