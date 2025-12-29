import { JsonRpcProvider } from "ethers"

/**
 * @notice  Fetches the last block of a given provider and return its number and date
 * @param   provider Blockchain rpc provider to query
 * @returns The block number and the block date
 */
export async function getLastBlock(provider: JsonRpcProvider) {
  const lastBlock = (await provider.getBlock("latest"))!
  return { blockNumber: lastBlock.number, blockDate: new Date(lastBlock.timestamp * 1_000) }
}
