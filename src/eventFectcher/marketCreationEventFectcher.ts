import { AddressLike, ethers, JsonRpcProvider, Log } from "ethers"
import { getEthLogs } from "./_baseFectcher"
import { MarketType } from "type/data"

// Define Event Signatures
const MARKET_CREATION_EVENT_SIGNATURES = {
  MarketConvexCrvCreated: ethers.id("MarketConvexCrvCreated(address)"),
  MarketConvexFxnCreated: ethers.id("MarketConvexFxnCreated(address)"),
  MarketNoSociabilizationCreated: ethers.id("MarketNoSociabilizationCreated(address)"),
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
  marketType: MarketType
}

export const fetchMarketCreationLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  contract: AddressLike // Single contract address
): Promise<MarketCreationEvent[]> => {
  const logs = await getEthLogs(provider, startingBlock, endingBlock, [contract], Object.values(MARKET_CREATION_EVENT_SIGNATURES))
  return logs.map((log) => parseMarketEvent(log))
}

const parseMarketEvent = (log: Log): MarketCreationEvent => {
  // all events have the same signature
  const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.data)
  return {
    blockNumber: log.blockNumber,
    address: decoded[0],
    marketType: marketTypes[log.topics[0]] as MarketType,
  }
}
