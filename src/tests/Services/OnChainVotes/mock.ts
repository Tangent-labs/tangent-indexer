import { parseEther } from "ethers"
import { GetGaugeVotesOut, VotesFromDb } from "../../../services/OnChainVoteService.js"

const GAUGE_A = "GAUGE_A"
const GAUGE_B = "GAUGE_B"
const GAUGE_C = "GAUGE_C"
const GAUGE_D = "GAUGE_D"
const GAUGE_E = "GAUGE_D"

const CONTROLLER_A = "CONTROLLER_A"
const CONTROLLER_B = "CONTROLLER_B"

const USER_A = "USER_A"
const USER_B = "USER_B"
const USER_C = "USER_C"

export const onChainSnapshot: GetGaugeVotesOut = {
  timestamp: 1_000,
  gaugeControllerWeights: [
    { gaugeController: CONTROLLER_A, weights: [parseEther("100")] },
    { gaugeController: CONTROLLER_B, weights: [parseEther("100"), parseEther("0.1")] },
  ],
}

export const votesFromDbPerTask: VotesFromDb[] = [
  {
    id: 1n,
    point_rate: 6,
    gauge_pools: { gauge_address: GAUGE_A, gauge_controller: { controller_address: CONTROLLER_A }, gauge_votes: [{ user_address: USER_A }] },
  },
  {
    id: 2n,
    point_rate: 3,
    gauge_pools:
    {
      gauge_address: GAUGE_B,
      gauge_controller: { controller_address: CONTROLLER_A },
      gauge_votes: [{ user_address: USER_A }, { user_address: USER_B }],
    },
  },

  {
    id: 2n,
    point_rate: 3,
    gauge_pools: {
      gauge_address: GAUGE_A,
      gauge_controller: { controller_address: CONTROLLER_A },
      gauge_votes: [{ user_address: USER_A }, { user_address: USER_B }],
    }
  },
  {
    id: 3n,
    point_rate: 0.25,
    gauge_pools: {
      gauge_address: GAUGE_D,
      gauge_controller: { controller_address: CONTROLLER_B },
      gauge_votes: [{ user_address: USER_A }, { user_address: USER_B }, { user_address: USER_C }],
    },
  },
]
