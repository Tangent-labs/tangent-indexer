import * as dotenv from "dotenv"
import { formatUnits } from "ethers"
import { fetchAllTransferLogs, fetchContractCreationBlock, fetchCurrentTokenSupply, fetchLatestBlock } from "../../eventFectcher/etherscanTransferFetcher.js"
import { computeBalancesFromTransfers, verifyBalances } from "../db/add-new/utils/seedInitialBalances.js"

dotenv.config()

/**
 * @notice Recomputes every holder's balance of an ERC-20 from its full Transfer history and prints
 * what seeding a task on that token would produce.
 * @dev Read-only: hits Etherscan and touches no database. This is the dry-run half of the LP task
 * balance seeder — same fetch, same fold, same verification, minus the writes.
 *
 * Requires ETHERSCAN_API_KEY.
 *
 * Usage:
 *   npm run tangent:check-token-balances -- <tokenAddress>
 *   END_BLOCK=… npm run tangent:check-token-balances -- <tokenAddress>
 *
 * By default it scans from the token's deploy block to chain head, which is the only range the
 * totalSupply reconciliation can check without an archive node. Passing END_BLOCK scans to that
 * block instead and skips the reconciliation — balances are then unverified.
 */

const CHAIN_ID = Number(process.env.CHAIN_ID_ETHERSCAN ?? 1)
const TOP_HOLDERS = 20

async function main() {
  const token = process.argv[2] ?? process.env.TOKEN
  if (!token || !/^0x[0-9a-fA-F]{40}$/.test(token)) {
    console.error("Usage: npm run tangent:check-token-balances -- <tokenAddress>")
    process.exit(1)
  }

  const fromBlock = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : await fetchContractCreationBlock(CHAIN_ID, token)
  const atHead = !process.env.END_BLOCK
  const toBlock = atHead ? await fetchLatestBlock(CHAIN_ID) : Number(process.env.END_BLOCK)

  console.log(`token  : ${token}`)
  console.log(`range  : ${fromBlock} -> ${toBlock}${atHead ? " (head)" : ""}`)

  const startedAt = Date.now()
  const logs = await fetchAllTransferLogs(CHAIN_ID, token, fromBlock, toBlock)
  console.log(`\ntransfers : ${logs.length} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)

  const balances = computeBalancesFromTransfers(logs)
  const holders = [...balances.entries()].filter(([, amount]) => amount > 0n).sort(([, a], [, b]) => (b > a ? 1 : b < a ? -1 : 0))

  console.log(`addresses : ${balances.size} touched, ${holders.length} holding, ${balances.size - holders.length} at zero`)

  // Only reconcilable against current supply if the scan ran to head.
  const totalSupply = atHead ? await fetchCurrentTokenSupply(CHAIN_ID, token) : undefined

  if (holders.length > 0) {
    console.log(`\ntop ${Math.min(TOP_HOLDERS, holders.length)} holders (would each get one lp_user_tasks row):`)
    for (const [address, amount] of holders.slice(0, TOP_HOLDERS)) {
      const share = totalSupply && totalSupply > 0n ? `${(Number((amount * 10000n) / totalSupply) / 100).toFixed(2)}%` : "?"
      console.log(`  ${address}  ${formatUnits(amount, 18).padStart(24)}  ${share.padStart(7)}`)
    }
    if (holders.length > TOP_HOLDERS) console.log(`  … and ${holders.length - TOP_HOLDERS} more`)
  }

  console.log("")
  verifyBalances(balances, token, toBlock, totalSupply)

  console.log(`\nSeeding a task on this token would open ${holders.length} segment(s), minus any excluded address.`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to execute:", (error as Error).message)
    process.exit(1)
  })
