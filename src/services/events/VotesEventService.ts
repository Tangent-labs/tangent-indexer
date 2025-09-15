// import { ethers, id, JsonRpcProvider, Log } from "ethers"
// import { getEthLogs } from "eventFectcher/_baseFectcher"
// import { VOTE_FOR_GAUGE } from "resources/eventSignatures"

// export class VotesEventService {
//   constructor() {}

//   gaugeControllers = ["0x2F50D538606Fa9EDD2B11E2446BEb18C9D5846bB"]

//   async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
//     // Fetch logs from MarketCreator
//     let votes = await getEthLogs(provider, startingBlock, endingBlock, ["0x2F50D538606Fa9EDD2B11E2446BEb18C9D5846bB"], [id(VOTE_FOR_GAUGE)])

//     // If some logs are coming from MarketCreator, we insert them in db
//     if (votes.length) {
//       votes = votes.map((vote) => this.parseVoteEvent(vote))
//       //   await this.marketContractsRepository.insertContracts(marketsCreated)
//     }
//   }

//   parseVoteEvent(log: Log): any {
//     // all events have the same signature
//     const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "address", "address", "uint256"], log.data)

//     return {
//       time: decoded[0],
//       user: decoded[1],
//       gauge_address: decoded[2],
//       weight: decoded[3],
//     }
//   }
// }
