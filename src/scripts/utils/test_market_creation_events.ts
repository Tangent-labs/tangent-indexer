import { JsonRpcProvider } from "ethers"

import * as dotenv from "dotenv"
import addresses from "../../addresses-liquidation.json"

import { fetchMarketCreationLogs } from "../../eventFectcher/marketCreationEventFectcher"
dotenv.config()

async function main() {
  // const provider = new JsonRpcProvider('https://eth.llamarpc.com');
  const provider = new JsonRpcProvider(process.env.CHAIN_RPC)

  const logs = await fetchMarketCreationLogs(provider, 21822215, 21822219, addresses.utilities.marketCreator)
  console.log(logs)
}
main().then(() => console.log("Done"))
