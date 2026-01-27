import { AddressLike, ethers, JsonRpcProvider } from "ethers"
import { getEthLogs } from "./_baseFetcher.js"

// Define Event Signatures
export const TRANSFER_TOPICS = {
  Transfer: ethers.id("Transfer(address,address,uint256)"),
  Staked: ethers.id("Staked(address,uint256)"),
  Withdrawn: ethers.id("Withdrawn(address,uint256)"),
  AddLiquidity: ethers.id("AddLiquidity(address,uint256[],uint256[],uint256,uint256)"),
  AddLiquidity2: ethers.id("AddLiquidity(address,uint256[2],uint256[2],uint256,uint256)"),
}

// Type Definition for Market Events
export const fetchTransferLogs = async (provider: JsonRpcProvider, startingBlock: number, endingBlock: number, contract: AddressLike[]): Promise<any[]> => {
  const logs = await getEthLogs(provider, startingBlock, endingBlock, contract, Object.values(TRANSFER_TOPICS))
  return logs
}
