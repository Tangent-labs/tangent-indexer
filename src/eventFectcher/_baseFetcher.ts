import { AddressLike, JsonRpcProvider, Log, toQuantity } from "ethers"

export const getEthLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  contracts: AddressLike[],
  topics: string[] | string[][]
): Promise<Log[]> => {
  try {
    const params = {
      fromBlock: toQuantity(startingBlock),
      toBlock: toQuantity(endingBlock),
      address: contracts,
      topics: !topics?.length ? [] : Array.isArray(topics[0]) ? topics : [topics],
    }
    const logs = await provider.send("eth_getLogs", [params])

    return logs
  } catch (error) {
    console.error("Error fetching logs:", error)
    throw error
  }
}
