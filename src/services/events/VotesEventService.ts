import { ethers, id, JsonRpcProvider, Log } from "ethers"

import { UserPointsVoteRepository } from "../../db/Points/UserPointsVoteRepository.js"

import { VOTE_FOR_GAUGE } from "../../resources/eventSignatures.js"
import { NumMap } from "../../services/boost/types.js"
import { getEthLogs } from "src/eventFectcher/_baseFetcher.js"

type ParsedVote = {
  gauge_controller: string
  timestamp: Date
  user_address: string
  gauge_pool: string
}

export const CONTROLLER_MAPPING: {
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
export class VotesEventService {
  constructor(voteRepository: UserPointsVoteRepository) {
    this.voteRepository = voteRepository
  }

  voteRepository: UserPointsVoteRepository
  gaugeControllers = [CONTROLLER_MAPPING.CRV.controller, CONTROLLER_MAPPING.FXN.controller]

  async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
    // Fetch logs from the gauge controllerts
    const voteLogs = await getEthLogs(provider, startingBlock, endingBlock, this.gaugeControllers, [id(VOTE_FOR_GAUGE)])

    if (voteLogs.length) {
      // Format all raw logs from the blockchain
      const votes = voteLogs.map((log) => this.parseVoteEvent(log))

      // Retrieve in database all gauges that are scoring and their associated ID
      const scoringGauges = await this.voteRepository.getScoringGauges()

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
