import { AddressLike, Contract, ethers, JsonRpcProvider, Log } from "ethers"
import { getEthLogs } from "./_baseFectcher"
import { MarketType } from "type/data"
import { Prisma } from "@prisma/client"

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
): Promise<Prisma.market_contractsCreateInput[]> => {
  const logs = await getEthLogs(provider, startingBlock, endingBlock, [marketCreator], Object.values(MARKET_CREATION_EVENT_SIGNATURES))
  return await Promise.all(logs.map((log) => parseMarketEvent(log, provider)))
}

const parseMarketEvent = async (log: Log, provider: JsonRpcProvider): Promise<Prisma.market_contractsCreateInput> => {
  // all events have the same signature
  const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["address", "string"], log.data)
  const name = decoded[1]
  const type = name.split("-")[0].trim()
  const marketAddress = decoded[0]

  const marketContract = new Contract(
    marketAddress,
    [
      {
        inputs: [],
        name: "collatToken",
        outputs: [
          {
            internalType: "contract IERC20Metadata",
            name: "",
            type: "address",
          },
        ],
        stateMutability: "view",
        type: "function",
      },
    ],
    provider
  )

  return {
    contract_name: name,
    contract_address: marketAddress,
    contract_type: type,
    collateral_address: await marketContract.collatToken(),
  }
}
