import { AddressLike, id, JsonRpcProvider } from "ethers"
import { getEthLogs } from "./_baseFetcher.js"

// Define Event Signatures
export const TRANSFER_TOPICS = {
  Transfer: id("Transfer(address,address,uint256)"),
  Staked: id("Staked(address,uint256)"),
  Withdrawn: id("Withdrawn(address,uint256)"),
  AddLiquidity: id("AddLiquidity(address,uint256[],uint256[],uint256,uint256)"),
  AddLiquidity2: id("AddLiquidity(address,uint256[2],uint256[2],uint256,uint256)"),
  RewardNotified: id("RewardNotified(address,address,uint256,uint256,uint256)"), // Only for Reward rewardAccumulator
  CheckpointIR: id("CheckpointIR(address,uint256,uint256)"), // Only for IRCalculator
}

// Type Definition for Market Events
export const fetchTransferLogs = async (provider: JsonRpcProvider, startingBlock: number, endingBlock: number, contract: AddressLike[]): Promise<any[]> => {
  const logs = await getEthLogs(provider, startingBlock, endingBlock, contract, Object.values(TRANSFER_TOPICS))
  return logs
}
