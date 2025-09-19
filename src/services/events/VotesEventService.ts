import { Prisma } from "@prisma/client"
import { UserVoteRepository } from "db/UserVoteRepository"
import { ethers, id, JsonRpcProvider, Log } from "ethers"
import { getEthLogs } from "eventFectcher/_baseFectcher"
import { VOTE_FOR_GAUGE } from "resources/eventSignatures"
import { NumMap } from "services/boost/types"

type ParsedVote = {
  gauge_controller: string
  timestamp: Date
  user_address: string
  gauge_pool: string
}

const GAUGE_CONTROLLERS = {
  CRV: "0x2F50D538606Fa9EDD2B11E2446BEb18C9D5846bB",
  FXN: "0xe60eB8098B34eD775ac44B1ddE864e098C6d7f37",
}
export class VotesEventService {
  constructor(voteRepository: UserVoteRepository) {
    this.voteRepository = voteRepository
  }
  voteRepository: UserVoteRepository
  gaugeControllers = [GAUGE_CONTROLLERS.CRV, GAUGE_CONTROLLERS.FXN]

  async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
    // Fetch logs from the gauge controllerts
    let voteLogs = await getEthLogs(provider, startingBlock, endingBlock, this.gaugeControllers, [id(VOTE_FOR_GAUGE)])

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
      timestamp: new Date(decoded[0]),
      user_address: decoded[1],
      gauge_pool: decoded[2],
    }
  }
}
