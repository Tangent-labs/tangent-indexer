import { Contract, JsonRpcProvider } from "ethers"
import { TransactionPrisma } from "../../../../type/prisma.js"
import { TransferLog } from "../../../../eventFectcher/etherscanTransferFetcher.js"

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

/**
 * @notice Folds a complete Transfer history into a final balance per address.
 * @dev Mints and burns are Transfers to/from the zero address, which is skipped rather than
 * tracked. Any address ending on a negative balance means the log set was incomplete, which
 * this refuses to paper over — see verifyBalances.
 */
export const computeBalancesFromTransfers = (logs: TransferLog[]): Map<string, bigint> => {
  const balances = new Map<string, bigint>()

  const setMap = (address: string, delta: bigint) => {
    if (address === ZERO_ADDRESS) return
    balances.set(address, (balances.get(address) ?? 0n) + delta)
  }

  for (const log of logs) {
    setMap(log.from, -log.value)
    setMap(log.to, log.value)
  }

  return balances
}

const TOTAL_SUPPLY_ABI = ["function totalSupply() view returns (uint256)"]

/**
 * @notice Reads totalSupply() at a historical block. Needs an archive node.
 */
export const fetchTotalSupplyAt = async (token: string, snapshotBlock: number, provider: JsonRpcProvider): Promise<bigint> => {
  return await new Contract(token, TOTAL_SUPPLY_ABI, provider).totalSupply({ blockTag: snapshotBlock })
}

/**
 * @notice Checks a recomputed balance set against invariants that only hold if every Transfer
 * was seen, and throws otherwise.
 * @dev Two checks:
 * 1. No negative balances. An address can only go negative if a credit to it was missed.
 * 2. Sum of balances == totalSupply at the snapshot block. This is the check that actually
 *    catches a truncated fetch, since a whole missing window can leave every balance positive.
 *
 * `totalSupply` is passed in rather than read here (see fetchTotalSupplyAt) so the check stays
 * pure. Omitting it skips check 2 — which is the only reason to do so for a rebasing token, or
 * for a synthetic token (Morpho collateral) that has no totalSupply.
 */
export const verifyBalances = (balances: Map<string, bigint>, token: string, snapshotBlock: number, totalSupply?: bigint) => {
  const negative = [...balances.entries()].filter(([, amount]) => amount < 0n)
  if (negative.length > 0) {
    const sample = negative.slice(0, 5).map(([a, v]) => `${a}=${v}`)
    throw new Error(`${negative.length} address(es) ended on a negative balance for ${token}, the Transfer history is incomplete: ${sample.join(", ")}`)
  }

  if (totalSupply === undefined) {
    console.warn("  ! skipping the totalSupply check — balances are unverified against chain state")
    return
  }

  const sum = [...balances.values()].reduce((acc, amount) => acc + amount, 0n)
  if (sum !== totalSupply) {
    throw new Error(`Recomputed balances for ${token} sum to ${sum} but totalSupply at block ${snapshotBlock} is ${totalSupply} (diff ${sum - totalSupply})`)
  }
  console.log(`  ✓ balances sum to totalSupply (${totalSupply}) at block ${snapshotBlock}`)
}

/**
 * @notice Asserts the LP points pointer still sits on the block the balances were snapshotted at.
 * @dev The LP points indexer replays (lp_points_block, event_blocks] for every task off one global
 * pointer, so a seeded balance is only consistent if the snapshot block IS that pointer. If the
 * pointer moved while the logs were being fetched, transfers in the gap would be replayed on top of
 * the seeded balances and double-counted. Run with the indexers stopped; this is the backstop.
 */
export const assertPointerAtSnapshot = async (tx: TransactionPrisma, snapshotBlock: number) => {
  const pointer = await tx.lp_points_block.findFirst({ orderBy: { block_id: "desc" } })
  const current = Number(pointer?.block_id)

  if (current !== snapshotBlock) {
    throw new Error(`lp_points_block moved to ${current} while snapshotting at ${snapshotBlock}. Stop the indexers and re-run.`)
  }
}

/**
 * Opens an initial lp_user_tasks segment for every holder of the task's token.
 *
 * Holders are inserted into `user` first because lp_user_points' user_address is an FK to user.address.
 * Seeding a holder the indexer has never seen would make compute_user_points break.
 *
 * @returns the number of seeded holders.
 */
export const seedInitialLpUserTasks = async (
  tx: TransactionPrisma,
  taskId: bigint,
  balances: Map<string, bigint>,
  startDate: Date,
  exclusions: Set<string>
): Promise<number> => {
  const holders = [...balances.entries()].filter(([address, amount]) => amount > 0n && !exclusions.has(address))

  if (holders.length === 0) return 0

  // first insert "new" users
  await tx.user.createMany({
    data: holders.map(([address]) => ({ address })),
    skipDuplicates: true,
  })

  // then create lp_user_tasks
  await tx.lp_user_tasks.createMany({
    data: holders.map(([address, amount]) => ({
      task_id: taskId,
      user_address: address,
      start_date: startDate,
      closed_date: null,
      amount: amount.toString(),
    })),
  })

  return holders.length
}
