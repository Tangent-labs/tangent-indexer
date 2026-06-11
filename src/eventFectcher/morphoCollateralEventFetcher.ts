import { AbiCoder, ethers, JsonRpcProvider, Log, ZeroAddress } from "ethers"
import { Prisma } from "@prisma/client"
import { getEthLogs } from "./_baseFetcher.js"
import { userAddress } from "./marketUserEvents.parsers.js"

// Define Event Signatures
// Morpho Blue is a singleton: every market lives in one contract and is identified by a bytes32 id
export const MORPHO_COLLATERAL_TOPICS = {
  SupplyCollateral: ethers.id("SupplyCollateral(bytes32,address,address,uint256)"),
  WithdrawCollateral: ethers.id("WithdrawCollateral(bytes32,address,address,address,uint256)"),
  Liquidate: ethers.id("Liquidate(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)"),
}

/**
 * Morpho collateral is not an ERC20 balance, so transfer_events are recomposed from the
 * market events (same trick as Convex staking and the debt tasks). The synthetic
 * token_address identifying the position is derived from the market id: its first 20 bytes.
 * It must be registered in tracked_erc20 (see add-new-lp-tasks-morpho.ts).
 */
export function morphoMarketSyntheticTokenAddress(marketId: string): string {
  return marketId.slice(0, 42).toLowerCase()
}

export const fetchMorphoCollateralLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  morphoSingleton: string,
  marketIds: string[]
): Promise<Log[]> => {
  // An empty topic list is a wildcard for eth_getLogs: without this guard we would
  // fetch the collateral events of EVERY Morpho market
  if (!marketIds.length) {
    return []
  }
  // topic0: one of the three collateral events, topic1: one of our market ids
  return await getEthLogs(
    provider,
    startingBlock,
    endingBlock,
    [morphoSingleton],
    [Object.values(MORPHO_COLLATERAL_TOPICS), marketIds.map((id) => id.toLowerCase())]
  )
}

/**
 * Recomposes synthetic transfer events from Morpho collateral logs: a supply is a mint,
 * a withdraw or a seizure is a burn. Single source of truth for the recomposition,
 * used by the indexer (via UserPointsService), the onboarding backfill and the checker.
 */
export function parseMorphoCollateralLogs(logs: Log[]) {
  const transferEvents: Prisma.transfer_eventsCreateManyInput[] = []
  const uniqueBlockId: Set<number> = new Set()

  logs.forEach((log) => {
    let transferEvent: Prisma.transfer_eventsUncheckedCreateInput
    switch (log.topics[0]) {
      case MORPHO_COLLATERAL_TOPICS.SupplyCollateral:
        transferEvent = parseMorphoSupplyCollateralEvent(log)
        break
      case MORPHO_COLLATERAL_TOPICS.WithdrawCollateral:
        transferEvent = parseMorphoWithdrawCollateralEvent(log)
        break
      case MORPHO_COLLATERAL_TOPICS.Liquidate:
        transferEvent = parseMorphoLiquidateEvent(log)
        break
      default:
        console.warn(`Unexpected Morpho log topic ${log.topics[0]}, skipping`)
        return
    }
    if (transferEvent.amount !== "0") {
      transferEvents.push(transferEvent)
      uniqueBlockId.add(log.blockNumber)
    }
  })

  return { transferEvents, morphoEventsBlockIds: Array.from(uniqueBlockId) }
}

export function parseMorphoSupplyCollateralEvent(log: Log): Prisma.transfer_eventsUncheckedCreateInput {
  const [assets] = AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)

  return {
    token_address: morphoMarketSyntheticTokenAddress(log.topics[1]),
    from: ZeroAddress.toLowerCase(),
    to: userAddress(log.topics[3]),
    amount: assets.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseMorphoWithdrawCollateralEvent(log: Log): Prisma.transfer_eventsUncheckedCreateInput {
  const [, assets] = AbiCoder.defaultAbiCoder().decode(["address", "uint256"], log.data)

  return {
    token_address: morphoMarketSyntheticTokenAddress(log.topics[1]),
    from: userAddress(log.topics[2]),
    to: ZeroAddress.toLowerCase(),
    amount: assets.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseMorphoLiquidateEvent(log: Log): Prisma.transfer_eventsUncheckedCreateInput {
  const [, , seizedAssets] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256", "uint256", "uint256"], log.data)

  return {
    token_address: morphoMarketSyntheticTokenAddress(log.topics[1]),
    from: userAddress(log.topics[3]),
    to: ZeroAddress.toLowerCase(),
    amount: seizedAssets.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}
