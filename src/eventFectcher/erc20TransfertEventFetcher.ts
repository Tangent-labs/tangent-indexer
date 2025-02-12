import { AddressLike, ethers, JsonRpcProvider } from "ethers"
import { getEthLogs } from "./_baseFectcher"

// Define Event Signatures
const TRANSFERT_SIGNATURES = {
  transfer: ethers.id("transfer(address,address,uint256)"),
}

// Type Definition for Market Events

export const fetchTransfertLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  contract: AddressLike = "0x6B175474E89094C44Da98b954EedeAC495271d0F" // DAI // Single contract address
): Promise<any[]> => {
  const logs = await getEthLogs(provider, startingBlock, endingBlock, [contract], Object.values(TRANSFERT_SIGNATURES))
  return logs
}
