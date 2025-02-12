import { JsonRpcProvider } from "ethers"

import * as dotenv from "dotenv"
import addresses from "./addresses-liquidation.json"

import { fetchBorrowLogs } from "./eventFectcher/marketBorrowerEventFetcher"
dotenv.config()

async function main() {
  // const provider = new JsonRpcProvider('https://eth.llamarpc.com');
  const provider = new JsonRpcProvider(process.env.CHAIN_RPC)

  const logs = await fetchBorrowLogs(
    provider,
    21822215,
    21822282,
    addresses.markets.map((market) => market.marketAddress)
  )
  console.log(logs)
}
main().then(() => console.log("Done"))
