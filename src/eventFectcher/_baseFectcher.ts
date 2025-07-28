import { AddressLike, JsonRpcProvider, Log, toBeHex } from "ethers"

export const getEthLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  contracts: AddressLike[],
  topics: string[]
): Promise<Log[]> => {
  try {
    const params = {
      fromBlock: toBeHex(startingBlock),
      toBlock: toBeHex(endingBlock),
      address: contracts,
      topics: !topics?.length ? [] : [topics],
    }

    const logs = await provider.send("eth_getLogs", [params])

    return logs
  } catch (error) {
    console.error("Error fetching logs:", error)
    throw error
  }
}
