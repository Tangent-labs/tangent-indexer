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
