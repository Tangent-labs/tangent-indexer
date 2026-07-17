import { ethers } from "ethers"
import { TRANSFER_TOPICS } from "./erc20TransferEventFetcher.js"

const ETHERSCAN_API = "https://api.etherscan.io/v2/api"

// Etherscan returns at most 1000 records per page and refuses to page past 10 pages,
// so a query window is capped at 10k records. A window that hits the cap is truncated
// silently — see fetchRange for how that is detected and worked around.
const PAGE_SIZE = 1000
const MAX_PAGES = 10

// Free tier allows 3 calls/sec. Pacing at ~2.9/sec keeps a full-history scan under the limit
// instead of leaning on the retry path to absorb rejections.
const MIN_GAP_MS = 350
const MAX_RETRIES = 5
// Exponential backoff between retries: 1s, 2s, 4s, 8s.
const RETRY_BASE_MS = 1000

// Etherscan reports transient server-side trouble as status "0" with the reason in `message`,
// the same shape it uses for permanent errors like a bad address. Only these are worth retrying.
const RETRYABLE_MESSAGE = /rate limit|timeout|too busy|unexpected error|try again/i

export type TransferLog = {
  from: string
  to: string
  value: bigint
  blockNumber: number
}

type RawLog = {
  topics: string[]
  data: string
  blockNumber: string
}

type EtherscanResponse<T> = {
  // The `proxy` module speaks JSON-RPC and has no status/message; every other module
  // reports success as status "1".
  jsonrpc?: string
  status?: string
  message?: string
  result: T
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let lastCall = 0

async function etherscan<T>(chainId: number, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.ETHERSCAN_API_KEY
  if (!apiKey) throw new Error("ETHERSCAN_API_KEY is missing from the environment")

  const url = new URL(ETHERSCAN_API)
  url.searchParams.set("chainid", String(chainId))
  url.searchParams.set("apikey", apiKey)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  let lastError = ""

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1))

    const wait = lastCall + MIN_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastCall = Date.now()

    try {
      const res = await fetch(url)

      // 5xx is Etherscan having a moment; 4xx is our request being wrong and will never succeed.
      if (res.status >= 500) {
        lastError = `HTTP ${res.status}`
        continue
      }
      if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`)

      const json = (await res.json()) as EtherscanResponse<T>

      // "No records found" is status 0 with an empty array — a valid empty result.
      if (json.jsonrpc || json.status === "1" || Array.isArray(json.result)) return json.result

      const message = `${json.message} - ${JSON.stringify(json.result)}`
      if (!RETRYABLE_MESSAGE.test(message)) throw new Error(`Etherscan error: ${message}`)
      lastError = message
    } catch (error) {
      // fetch() rejects on network-level failures (DNS, socket reset, timeout). A full-history
      // scan is thousands of sequential calls over many minutes, so one dropped packet is
      // expected — losing the whole scan to it is not.
      if (!(error instanceof TypeError)) throw error
      lastError = error.message
    }
  }

  throw new Error(`Etherscan failed after ${MAX_RETRIES} attempts: ${lastError}`)
}

function decodeTransfer(log: RawLog): TransferLog {
  // Transfer(address indexed from, address indexed to, uint256 value)
  return {
    from: ethers.getAddress("0x" + log.topics[1].slice(26)).toLowerCase(),
    to: ethers.getAddress("0x" + log.topics[2].slice(26)).toLowerCase(),
    value: BigInt(log.data),
    blockNumber: parseInt(log.blockNumber, 16),
  }
}

/**
 * Fetch one block window, returning null if it hit Etherscan's 10k record cap
 * (i.e. the window is truncated and must be split).
 */
async function fetchWindow(chainId: number, token: string, fromBlock: number, toBlock: number): Promise<RawLog[] | null> {
  const all: RawLog[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await etherscan<RawLog[]>(chainId, {
      module: "logs",
      action: "getLogs",
      address: token,
      fromBlock: String(fromBlock),
      toBlock: String(toBlock),
      topic0: TRANSFER_TOPICS.Transfer,
      page: String(page),
      offset: String(PAGE_SIZE),
    })

    all.push(...batch)
    if (batch.length < PAGE_SIZE) return all
  }

  // MAX_PAGES full pages means Etherscan is holding back records it will not serve.
  return null
}

/**
 * Fetch every Transfer log for `token` between the two blocks, splitting any window
 * dense enough to hit Etherscan's record cap.
 *
 * Completeness matters more than speed here: a balance recomputed from a truncated log
 * set is wrong forever, and nothing downstream would notice.
 */
async function fetchRange(chainId: number, token: string, fromBlock: number, toBlock: number): Promise<RawLog[]> {
  const logs = await fetchWindow(chainId, token, fromBlock, toBlock)
  if (logs !== null) return logs

  if (fromBlock >= toBlock) {
    throw new Error(`Block ${fromBlock} alone exceeds Etherscan's ${PAGE_SIZE * MAX_PAGES} record cap for ${token}`)
  }

  const mid = Math.floor((fromBlock + toBlock) / 2)
  console.log(`  window ${fromBlock}-${toBlock} hit the record cap, splitting at ${mid}`)
  const left = await fetchRange(chainId, token, fromBlock, mid)
  const right = await fetchRange(chainId, token, mid + 1, toBlock)
  return [...left, ...right]
}

/**
 * @notice Every ERC-20 Transfer emitted by `token` between `fromBlock` and `toBlock` (inclusive),
 * decoded and sorted by block.
 * @dev Sourced from the Etherscan V2 logs API rather than eth_getLogs, so it needs no archive node.
 * Requires ETHERSCAN_API_KEY.
 */
export const fetchAllTransferLogs = async (chainId: number, token: string, fromBlock: number, toBlock: number): Promise<TransferLog[]> => {
  // Etherscan silently treats an unparseable toBlock as "latest" and returns data anyway.
  // A caller that passes NaN would get head balances back believing they were snapshot balances,
  // and the totalSupply reconciliation would still pass — head balances against head supply.
  // Fail loudly instead: the snapshot block has to be exactly the block the caller asked for.
  for (const [name, value] of [
    ["fromBlock", fromBlock],
    ["toBlock", toBlock],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer, got ${value}`)
    }
  }
  if (fromBlock > toBlock) throw new Error(`fromBlock ${fromBlock} is after toBlock ${toBlock}`)

  const raw = await fetchRange(chainId, token.toLowerCase(), fromBlock, toBlock)
  const decoded = raw.map(decodeTransfer)
  decoded.sort((a, b) => a.blockNumber - b.blockNumber)
  return decoded
}

/**
 * @notice The block a contract was deployed at — the natural start of a full-history scan.
 */
export const fetchContractCreationBlock = async (chainId: number, token: string): Promise<number> => {
  const result = await etherscan<{ blockNumber: string }[]>(chainId, {
    module: "contract",
    action: "getcontractcreation",
    contractaddresses: token,
  })

  const blockNumber = Number(result?.[0]?.blockNumber)
  if (!Number.isInteger(blockNumber)) throw new Error(`Could not resolve the creation block of ${token}`)
  return blockNumber
}

/**
 * @notice Current chain head according to Etherscan.
 */
export const fetchLatestBlock = async (chainId: number): Promise<number> => {
  const result = await etherscan<string>(chainId, { module: "proxy", action: "eth_blockNumber" })

  const blockNumber = parseInt(result, 16)
  if (!Number.isInteger(blockNumber)) throw new Error(`Could not resolve the head block: ${JSON.stringify(result)}`)
  return blockNumber
}

/**
 * @notice Current totalSupply of an ERC-20, per Etherscan.
 * @dev This is the supply *now*, not at a past block — only use it to reconcile a scan that ran
 * to chain head. Reconciling a historical snapshot needs an archive node (see fetchTotalSupplyAt).
 */
export const fetchCurrentTokenSupply = async (chainId: number, token: string): Promise<bigint> => {
  const result = await etherscan<string>(chainId, {
    module: "stats",
    action: "tokensupply",
    contractaddress: token,
  })

  return BigInt(result)
}
