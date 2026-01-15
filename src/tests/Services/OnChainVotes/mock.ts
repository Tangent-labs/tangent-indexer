import { parseEther } from "ethers"
import { GetGaugeVotesOut } from "../../../services/OnChainVoteService.js"

const GAUGE_A = "GAUGE_A"
const GAUGE_B = "GAUGE_B"
const GAUGE_C = "GAUGE_C"
const GAUGE_D = "GAUGE_D"

const CONTROLLER_A = "CONTROLLER_A"
const CONTROLLER_B = "CONTROLLER_B"

export const USER_A = "USER_A"
export const USER_B = "USER_B"
export const USER_C = "USER_C"

const timestamp = 1768480830n
export const dateTimestamp = new Date(Number(timestamp) * 1000)

export const votesFromDbPerTask = [
  {
    id: 1n,
    point_rate: 6,
    gaugePools: {
      gauge_address: GAUGE_A,
      gauge_controller: { id: 1n, controller_address: CONTROLLER_A },
      gauge_votes: [{ user_address: USER_A }],
    },
  },
  {
    id: 2n,
    point_rate: 3,
    gaugePools: {
      gauge_address: GAUGE_B,
      gauge_controller: { id: 1n, controller_address: CONTROLLER_A },
      gauge_votes: [{ user_address: USER_A }, { user_address: USER_B }],
    },
  },
  {
    id: 3n,
    point_rate: 3,
    gaugePools: {
      gauge_address: GAUGE_C,
      gauge_controller: { id: 1n, controller_address: CONTROLLER_A },
      gauge_votes: [{ user_address: USER_A }, { user_address: USER_B }],
    },
  },
  {
    id: 4n,
    point_rate: 0.25,
    gaugePools: {
      gauge_address: GAUGE_D,
      gauge_controller: { id: 2n, controller_address: CONTROLLER_B },
      gauge_votes: [{ user_address: USER_A }, { user_address: USER_B }, { user_address: USER_C }],
    },
  },
]

export const onChainSnapshot: GetGaugeVotesOut = {
  timestamp,
  gaugeControllerWeights: [
    { gaugeController: CONTROLLER_A, weights: [parseEther("100"), 0n, parseEther("50"), parseEther("2.5"), parseEther("25")] },
    { gaugeController: CONTROLLER_B, weights: [parseEther("12"), parseEther("0.1")] },
  ],
}

export const epochProposal = [
  {
    id: 3n,
    epoch_id: CONTROLLER_A + " " + dateTimestamp.toString(),
    processed_at: dateTimestamp,
    epoch_name: CONTROLLER_A + " " + dateTimestamp.toString(),
    gauge_controller_id: 1n,
  },
  {
    id: 4n,
    epoch_id: CONTROLLER_B + " " + dateTimestamp.toString(),
    processed_at: dateTimestamp,
    epoch_name: CONTROLLER_B + " " + dateTimestamp.toString(),
    gauge_controller_id: 2n,
  },
]
