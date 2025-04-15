import { ethers, JsonRpcProvider } from "ethers"

const ERC20_EVENT_SIGNATURES = {
  Approve: ethers.id("Approval(address,address,uint256)"),
  Transfer: ethers.id("Transfer(address,address,uint256)"),
}

export const fetchErc20Logs = async (provider: JsonRpcProvider, startingBlock: number, endingBlock: number, contracts: string[]) => {
  try {
    console.log(`Fetching logs from block ${startingBlock} to ${endingBlock}`)

    const logs = await provider.send("eth_getLogs", [
      {
        fromBlock: ethers.toBeHex(startingBlock),
        toBlock: ethers.toBeHex(endingBlock),
        address: contracts,
        topics: [[ERC20_EVENT_SIGNATURES.Approve, ERC20_EVENT_SIGNATURES.Transfer]], // Match either event
      },
    ])

    console.log(`Fetched ${logs.length} logs`)
  } catch (error) {
    console.error("Error fetching logs:", error)
  }
}
