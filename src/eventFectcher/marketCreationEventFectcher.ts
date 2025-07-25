import { AddressLike, Contract, ethers, id, JsonRpcProvider, Log } from "ethers"
import { getEthLogs } from "./_baseFectcher"
import { MarketType } from "type/data"
import { Prisma } from "@prisma/client"
import { MARKET_CONVEX_CRV_CREATED, MARKET_CONVEX_FXN_CREATED, MARKET_NO_SOCIABILIZATION_CREATED } from "resources/eventSignatures"

// Define Event Signatures

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
): Promise<Prisma.usg_marketsCreateInput[]> => {
  const logs = await getEthLogs(
    provider,
    startingBlock,
    endingBlock,
    [marketCreator],
    [id(MARKET_CONVEX_CRV_CREATED), id(MARKET_CONVEX_FXN_CREATED), id(MARKET_NO_SOCIABILIZATION_CREATED)]
  )
  return await Promise.all(logs.map((log) => parseMarketEvent(log, provider)))
}

const parseMarketEvent = async (log: Log, provider: JsonRpcProvider): Promise<Prisma.usg_marketsCreateInput> => {
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
