import { Prisma } from "@prisma/client"
import { AddressLike, Contract, ethers, id, JsonRpcProvider, Log } from "ethers"

import {
  BASIC_ERC20_MARKET_CREATED,
  MARKET_CONVEX_CRV_CREATED,
  MARKET_CONVEX_FXN_CREATED,
  MARKET_CURVE_GAUGE_CREATED,
  MARKET_STAKEDAO_VAULT_V2_CREATED,
} from "../resources/eventSignatures.js"
import { MarketType } from "../type/data.js"
import { fetchBlockTimestamps } from "../utils/getLastBlock.js"
import { getEthLogs } from "./_baseFetcher.js"

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
    [
      id(MARKET_CONVEX_CRV_CREATED),
      id(MARKET_CONVEX_FXN_CREATED),
      id(BASIC_ERC20_MARKET_CREATED),
      id(MARKET_STAKEDAO_VAULT_V2_CREATED),
      id(MARKET_CURVE_GAUGE_CREATED),
    ]
  )

  const creationDates = await fetchBlockTimestamps(
    logs.map((l) => l.blockNumber),
    provider._getConnection().url
  )

  return await Promise.all(
    logs.map((log) => {
      const blockNumber = parseInt(log.blockNumber.toString(), 16)
      const date = new Date(creationDates.get(blockNumber)! * 1000)
      return parseMarketEvent(log, provider, log.blockNumber, date)
    })
  )
}

const parseMarketEvent = async (log: Log, provider: JsonRpcProvider, creationBlock: number, creationDate: Date): Promise<Prisma.usg_marketsCreateInput> => {
  // all events have the same signature
  const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["address", "string"], log.data)
  const name = decoded[1]
  const type = name.split("-")[0].trim()
  const marketAddress = decoded[0] as string

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
    is_active: true,
    contract_address: marketAddress.toLowerCase(),
    contract_type: type,
    collateral_address: await marketContract.collatToken(),
    create_date: creationDate,
    create_block: parseInt(creationBlock.toString(), 16),
  }
}
