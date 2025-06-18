import { AddressLike, ethers, JsonRpcProvider, Log } from "ethers"
import { getEthLogs } from "./_baseFectcher"
import { MarketType } from "type/data"
import { market_contracts } from "@prisma/client"

// Define Event Signatures

const MARKET_CREATION_EVENT_SIGNATURES = {
  MarketConvexCrvCreated: ethers.id("MarketConvexCrvCreated(address,string)"),
  MarketConvexFxnCreated: ethers.id("MarketConvexFxnCreated(address,string)"),
  MarketNoSociabilizationCreated: ethers.id("MarketNoSociabilizationCreated(address,string)"),
}

const marketTypes = {
  [MARKET_CREATION_EVENT_SIGNATURES.MarketConvexCrvCreated]: "ConvexCrv",
  [MARKET_CREATION_EVENT_SIGNATURES.MarketConvexFxnCreated]: "ConvexFxn",
  [MARKET_CREATION_EVENT_SIGNATURES.MarketNoSociabilizationCreated]: "NoSociabilization",
}

// Type Definition for Market Events
export type MarketCreationEvent = {
  address: AddressLike
  blockNumber: number
  name: string
  marketType: MarketType
}

export const fetchMarketCreationLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  marketCreator: AddressLike
): Promise<market_contracts[]> => {
  const logs = await getEthLogs(provider, startingBlock, endingBlock, [marketCreator], Object.values(MARKET_CREATION_EVENT_SIGNATURES))
  return logs.map((log) => parseMarketEvent(log))
}

const parseMarketEvent = (log: Log): market_contracts => {
  // all events have the same signature
  const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["address", "string"], log.data)
  const name = decoded[1]
  const type = name.split("-")[0].trim()

  return {
    contract_name: name,
    contract_address: decoded[0],
    contract_type: type,
  } as market_contracts
}
