import { JsonRpcProvider } from "ethers"

export type BestRpcResult = {
  index: number
  blockNumber: number
  responseTime: number
}

/**
 * Gets the best RPC provider by querying all providers in parallel and selecting
 * the one with the highest block number. Among providers with the same block number,
 * selects the fastest one.
 *
 * @param providers Array of JSON RPC providers to query
 * @param timeoutMs Timeout in milliseconds for each provider request (default: 1000ms)
 * @returns The index, block number, and response time of the best provider
 * @throws Error if no RPC providers respond successfully
 */
export async function getBestRpcProvider(providers: JsonRpcProvider[], timeoutMs: number = 1000): Promise<BestRpcResult> {
  // Helper function to add timeout to a promise
  const withTimeout = <T>(promise: Promise<T>, timeout: number): Promise<T> => {
    return Promise.race([promise, new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error("TIMEOUT")), timeout))])
  }

  // Track timing to find the fastest response with the highest block number
  const blockPromises = providers.map((provider, index) => {
    const requestStartTime = Date.now()
    return withTimeout(provider.getBlockNumber(), timeoutMs)
      .then((blockNumber) => ({
        blockNumber,
        index,
        responseTime: Date.now() - requestStartTime,
      }))
      .catch(() => ({
        blockNumber: 0,
        index,
        responseTime: Date.now() - requestStartTime,
      }))
  })

  // Collect all results
  const results: Array<{ blockNumber: number; index: number; responseTime: number }> = []
  const settledResults = await Promise.allSettled(blockPromises)

  // Process all results
  settledResults.forEach((result) => {
    if (result.status === "fulfilled" && result.value.blockNumber > 0) {
      results.push(result.value)
    }
  })

  if (results.length === 0) {
    throw new Error("NO_RPC_CONNECTED")
  }

  // Sort by block number (descending) then by response time (ascending)
  // This gives us the highest block number, and among those, the fastest response
  results.sort((a, b) => {
    if (b.blockNumber !== a.blockNumber) {
      return b.blockNumber - a.blockNumber // Higher block number first
    }
    return a.responseTime - b.responseTime // Faster response first for same block number
  })

  return results[0]
}
