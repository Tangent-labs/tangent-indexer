// import { PrismaClient } from "@prisma/client"
// import * as dotenv from "dotenv"
// import { JsonRpcProvider } from "ethers"
// // import { chainView } from "utils/chainView"

// // import * as usgContractAddresses from "../addresses.json"
// // import * as MarketCurrentAPR from "../abis/MarketCurrentAPR.json"
// import { MarketContractsRepository } from "db/MarketContractsRepository"
// dotenv.config()

// const prismaClient = new PrismaClient()

// export type APR = {
//   token: string
//   amountPerYear: bigint
// }
// export type TVLAprs = {
//   totalStakedAmount: bigint
//   totalStakedUSD: bigint
//   aprs: APR[]
// }

// async function main() {
//   const chainRpcs = process.env.CHAIN_RPCS
//   if (!chainRpcs) {
//     throw new Error("CHAIN_RPCS_NOT_SET")
//   }
//   const marketContractsRepository = new MarketContractsRepository(prismaClient)

//   const provider = new JsonRpcProvider(chainRpcs.split(",")[0])

//   const markets = await marketContractsRepository.getContracts()

// //   const APRTvlData = await chainView<[string[], string], TVLAprs[]>(provider, MarketCurrentAPR.abi, MarketCurrentAPR.bytecode, [
// //     markets.map((market) => market.contract_address),
// //     usgContractAddresses.utilities.rewardAccumulator,
// //   ])
// }

// main().then()
