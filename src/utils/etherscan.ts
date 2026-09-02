import axios from "axios"

const ETHERSCAN_API = "https://api.etherscan.io/v2/api"
const CHAIN_ID = 1
// Etherscan caps getLogs at 1000 results per page
const PAGE_SIZE = 1000
// The API rejects bursts ("Max calls per sec rate limit reached"), so calls are serialized and
// spaced. Raise ETHERSCAN_MIN_INTERVAL_MS if the plan is stricter, lower it if it allows more.
const MIN_INTERVAL_MS = Number(process.env.ETHERSCAN_MIN_INTERVAL_MS ?? 400)
const MAX_RETRIES = 5
const RETRY_BASE_MS = 1_000

export type EtherscanLog = {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  logIndex: string
  timeStamp: string
  transactionHash: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Every call chains onto the previous one, so concurrent callers (Promise.all over several topics)
// still go out one at a time, MIN_INTERVAL_MS apart
let queue: Promise<unknown> = Promise.resolve()

function throttle<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(async () => {
    await sleep(MIN_INTERVAL_MS)
    return task()
  })
  queue = result.catch(() => undefined)
  return result
}

function payloadOf(data: { result?: unknown; message?: unknown }) {
  return `${data?.result ?? ""} ${data?.message ?? ""}`.toLowerCase()
}

function isRateLimited(data: { result?: unknown; message?: unknown }) {
  return payloadOf(data).includes("rate limit")
}

// An empty result is reported as status 0, with the wording landing in `message` or in `result`
// depending on the endpoint. It is a legitimate empty answer, not a failure.
function isEmptyResult(data: { result?: unknown; message?: unknown }) {
  return payloadOf(data).includes("no records found")
}

export async function etherscanCall<T>(params: Record<string, string | number>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const data = await throttle(async () => {
      const response = await axios.get(ETHERSCAN_API, {
        params: { chainid: CHAIN_ID, apikey: process.env.ETHERSCAN_API_KEY, ...params },
      })
      return response.data
    })

    if (isRateLimited(data)) {
      if (attempt >= MAX_RETRIES) {
        throw new Error(`Etherscan rate limit still hit after ${MAX_RETRIES} retries (${JSON.stringify(params)})`)
      }
      const backoff = RETRY_BASE_MS * 2 ** attempt
      console.warn(`Etherscan rate limited, retrying in ${backoff}ms`)
      await sleep(backoff)
      continue
    }

    if (data.status === "0" && !isEmptyResult(data)) {
      throw new Error(`Etherscan error (${JSON.stringify(params)}): ${data.message} - ${data.result}`)
    }

    return data.result
  }
}

export async function getBlockByTimestamp(timestamp: number, closest: "before" | "after") {
  const block = await etherscanCall<string>({ module: "block", action: "getblocknobytime", timestamp, closest })
  return Number(block)
}

/**
 * @notice  Pages through getLogs, re-anchoring fromBlock on the last returned block whenever a page
 *          comes back full, since Etherscan caps a page at PAGE_SIZE results
 * @param   topic1  Optional second topic, ANDed with topic0
 */
export async function fetchAllLogs(address: string, topic0: string, fromBlock: number, toBlock: number | "latest", topic1?: string): Promise<EtherscanLog[]> {
  const logs: EtherscanLog[] = []
  let cursor = fromBlock

  while (true) {
    const page = await etherscanCall<EtherscanLog[] | "No records found">({
      module: "logs",
      action: "getLogs",
      address,
      topic0,
      ...(topic1 ? { topic1, topic0_1_opr: "and" } : {}),
      fromBlock: cursor,
      toBlock,
      page: 1,
      offset: PAGE_SIZE,
    })

    if (!Array.isArray(page) || page.length === 0) break

    logs.push(...page)

    if (page.length < PAGE_SIZE) break

    cursor = Number(page[page.length - 1].blockNumber) + 1
  }

  return logs
}
