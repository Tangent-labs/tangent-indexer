import { Prisma } from "@prisma/client"
import { Log, AbiCoder } from "ethers"

export function userAddress(topic: string): string {
  return AbiCoder.defaultAbiCoder().decode(["address"], topic)[0].toLowerCase()
}

export function parseCheckpointIR(log: Log, mapMarketIdAddresses: Map<string, number>): Prisma.checkpoint_irCreateManyInput {
  const [irAmount, newIndex] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], log.data)

  const market = userAddress(log.topics[1])
  const marketId = mapMarketIdAddresses.get(market.toLowerCase())!
  return {
    market_id: marketId,
    interest: irAmount.toString(),
    newIndex: newIndex.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseRewardNotified(
  log: Log,
  mapMarketIdAddresses: Map<string, number>,
  mapTokenIdAddresses: Map<string, bigint>
): Prisma.reward_notifiedCreateManyInput {
  const [marketAddress, token, streamed, harvestFee, rewardCut] = AbiCoder.defaultAbiCoder().decode(
    ["address", "address", "uint256", "uint256", "uint256"],
    log.data
  )

  const marketId = mapMarketIdAddresses.get(marketAddress.toLowerCase())!
  const tokenId = mapTokenIdAddresses.get(token.toLowerCase())!

  return {
    market_id: marketId,
    token_id: tokenId,
    reward_cut: rewardCut.toString(),
    streamed: streamed.toString(),
    harvester_fee: harvestFee.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}
