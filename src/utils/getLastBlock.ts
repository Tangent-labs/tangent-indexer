import axios from "axios"
import { JsonRpcProvider } from "ethers"
import { BlockInfo } from "src/services/BlockService.js"

/**
 * @notice  Fetches the last block of a given provider and return its number and date
 * @param   provider Blockchain rpc provider to query
 * @returns The block number and the block date
 */
export async function getLastBlock(provider: JsonRpcProvider) {
  const lastBlock = (await provider.getBlock("latest"))!
  return { blockNumber: lastBlock.number, blockDate: new Date(lastBlock.timestamp * 1_000) }
}

export async function fetchBlockTimestamps(blockNumbers: (number | string)[], providerURL: string) {
  // No timestamp to fetch
  if (blockNumbers.length === 0) {
    return new Map()
  }
  const requests = blockNumbers.map((blockNumber, index) => {
    // This kind of black magic is mandatory because of Log from ethers returns sometimes a string
    if (typeof blockNumber === "number") {
      blockNumber = "0x" + blockNumber.toString(16)
    }
    return {
      jsonrpc: "2.0",
      id: index + 1,
      method: "eth_getBlockByNumber",
      params: [
        blockNumber, // format hex
        false,
      ],
    }
  })

  const res = await axios.post(providerURL, requests, {
    headers: { "Content-Type": "application/json" },
  })

  const responses = res.data as BlockInfo[]

  const timestampPerBlockId: Map<number, number> = new Map()

  responses.forEach((resp: BlockInfo) => {
    timestampPerBlockId.set(parseInt(resp.result.number, 16), parseInt(resp.result.timestamp, 16))
  })

  return timestampPerBlockId
}
