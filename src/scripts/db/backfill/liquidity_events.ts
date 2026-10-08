// Backfills the USG pools LP events since April 1st 2026 by querying Etherscan directly:
// AddLiquidity (both ABI variants), RemoveLiquidity (and its One / Imbalance variants) and
// TokenExchange, stored in add_liquidity_events / remove_liquidity / token_exchange. All three
// feed the LP part of the daily volume.
//
// It also repairs the block_date of remove_liquidity rows already inserted by the block indexer:
// those were stored without date hydration, so they carry the insertion time instead of the block
// time, which puts them in the wrong day bucket.
//
// CAUTION: add_liquidity_events is also the input of the predeposit campaign accounting, which sums
// lp_amount per user against the LP cap. USG-USDC and USG-frxUSD have been indexed since the
// campaign started, so every one of their AddLiquidity rows already exists: a duplicate would
// double count a user deposit. Rows are therefore matched on the full event identity before
// inserting, and DRY_RUN=1 reports what would be written without touching the database.
import * as dotenv from "dotenv"
import { Log } from "ethers"
import { Prisma, PrismaClient } from "@prisma/client"

import { LiquidityRepository } from "../../../db/LiquidityRepository.js"
import { TRANSFER_TOPICS } from "../../../eventFectcher/erc20TransferEventFetcher.js"
import { EtherscanLog, fetchAllLogs, getBlockByTimestamp } from "../../../utils/etherscan.js"
import {
  parseAddLiquidity,
  parseAddLiquidity2,
  parseRemoveLiquidity,
  parseRemoveLiquidityImbalance,
  parseRemoveLiquidityOne,
  parseTokenExchange,
} from "../../../eventFectcher/marketUserEvents.parsers.js"

dotenv.config()

const FROM_DATE = new Date("2026-08-20T00:00:00Z")
const DRY_RUN = process.env.DRY_RUN === "1"
// Transfer.from, indexed, so mints can be filtered server side
const ZERO_ADDRESS_TOPIC = `0x${"0".repeat(64)}`

function blockDate(log: EtherscanLog) {
  return new Date(Number(log.timeStamp) * 1000)
}

/**
 * @notice  Neither table has a unique constraint, and no log index is stored, so the amounts are
 *          part of the key to tell apart several events of the same kind in one transaction
 */
function removeLiquidityKey(event: { tx_hash: string; usg_lp_id: bigint | number; token0_amount: string; token1_amount: string }) {
  return [event.tx_hash, event.usg_lp_id, event.token0_amount, event.token1_amount].join("|")
}

function addLiquidityKey(event: {
  tx_hash: string
  usg_lp_id: bigint | number
  provider: string
  lp_amount: string
  token0_amount: string
  token1_amount: string
}) {
  return [event.tx_hash, event.usg_lp_id, event.provider, event.lp_amount, event.token0_amount, event.token1_amount].join("|")
}

function tokenExchangeKey(event: {
  tx_hash: string
  usg_lp_id: bigint | number
  sold_id: number
  tokens_sold: string
  bought_id: number
  tokens_bought: string
}) {
  return [event.tx_hash, event.usg_lp_id, event.sold_id, event.tokens_sold, event.bought_id, event.tokens_bought].join("|")
}

async function main() {
  const prisma = new PrismaClient()
  const liquidityRepository = new LiquidityRepository(prisma)

  try {
    const pools = await prisma.usg_lp_keys.findMany()
    if (pools.length === 0) {
      throw new Error("NO_USG_LP_KEYS_SEEDED")
    }

    const fromBlock = await getBlockByTimestamp(Math.floor(FROM_DATE.getTime() / 1000), "after")
    console.log(`Backfilling LP events of ${pools.length} pools since ${FROM_DATE.toISOString()} (block ${fromBlock})`)

    const addLiquidityEvents: Prisma.add_liquidity_eventsCreateManyInput[] = []
    const removeLiquidityEvents: Prisma.remove_liquidityCreateManyInput[] = []
    const tokenExchangeEvents: Prisma.token_exchangeCreateManyInput[] = []

    for (const pool of pools) {
      const [addLogs, addLogs2, mintLogs, removeLogs, removeOneLogs, removeImbalanceLogs, exchangeLogs] = await Promise.all([
        fetchAllLogs(pool.lp_address, TRANSFER_TOPICS.AddLiquidity, fromBlock, "latest"),
        fetchAllLogs(pool.lp_address, TRANSFER_TOPICS.AddLiquidity2, fromBlock, "latest"),
        // The LP mint carries the amount of LP received, which AddLiquidity itself does not report
        fetchAllLogs(pool.lp_address, TRANSFER_TOPICS.Transfer, fromBlock, "latest", ZERO_ADDRESS_TOPIC),
        fetchAllLogs(pool.lp_address, TRANSFER_TOPICS.RemoveLiquidity, fromBlock, "latest"),
        fetchAllLogs(pool.lp_address, TRANSFER_TOPICS.RemoveLiquidityOne, fromBlock, "latest"),
        fetchAllLogs(pool.lp_address, TRANSFER_TOPICS.RemoveLiquidityImbalance, fromBlock, "latest"),
        fetchAllLogs(pool.lp_address, TRANSFER_TOPICS.TokenExchange, fromBlock, "latest"),
      ])

      console.log(
        `${pool.lp_name}: ${addLogs.length + addLogs2.length} AddLiquidity, ${removeLogs.length} RemoveLiquidity, ` +
          `${removeOneLogs.length} RemoveLiquidityOne, ${removeImbalanceLogs.length} RemoveLiquidityImbalance, ` +
          `${exchangeLogs.length} TokenExchange`
      )

      // The block indexer reads the LP amount off the Transfer immediately preceding AddLiquidity.
      // Etherscan returns each topic separately, so the same pairing is rebuilt from the log index:
      // the mint of a given add is the last one before it inside the transaction.
      const mintsByTx = new Map<string, EtherscanLog[]>()
      mintLogs.forEach((log) => {
        const mints = mintsByTx.get(log.transactionHash)
        if (mints) {
          mints.push(log)
        } else {
          mintsByTx.set(log.transactionHash, [log])
        }
      })
      mintsByTx.forEach((mints) => mints.sort((a, b) => Number(a.logIndex) - Number(b.logIndex)))

      const mintedAmountFor = (log: EtherscanLog): string | undefined => {
        const mints = mintsByTx.get(log.transactionHash) ?? []
        const mint = [...mints].reverse().find((m) => Number(m.logIndex) < Number(log.logIndex))
        // Transfer packs value in data, unindexed
        return mint ? BigInt(mint.data).toString() : undefined
      }

      const parsedAdds = [...addLogs.map((log) => ({ log, parse: parseAddLiquidity })), ...addLogs2.map((log) => ({ log, parse: parseAddLiquidity2 }))]

      parsedAdds.forEach(({ log, parse }) => {
        const lpAmount = mintedAmountFor(log)
        if (lpAmount === undefined) {
          // Inserting a wrong lp_amount would corrupt the predeposit accounting, so skip loudly
          console.warn(`Skipping AddLiquidity without a matching LP mint: tx ${log.transactionHash} log ${log.logIndex}`)
          return
        }
        const parsed = parse(log as unknown as Log, pool.id, lpAmount)
        parsed.block_date = blockDate(log)
        addLiquidityEvents.push(parsed)
      })

      const parsedRemovals = [
        ...removeLogs.map((log) => ({ log, parsed: parseRemoveLiquidity(log as unknown as Log, pool.id) })),
        ...removeOneLogs.map((log) => ({ log, parsed: parseRemoveLiquidityOne(log as unknown as Log, pool.id) })),
        ...removeImbalanceLogs.map((log) => ({ log, parsed: parseRemoveLiquidityImbalance(log as unknown as Log, pool.id) })),
      ]

      parsedRemovals.forEach(({ log, parsed }) => {
        parsed.block_date = blockDate(log)
        removeLiquidityEvents.push(parsed)
      })

      exchangeLogs.forEach((log) => {
        const parsed = parseTokenExchange(log as unknown as Log, pool.id)
        parsed.block_date = blockDate(log)
        tokenExchangeEvents.push(parsed)
      })
    }

    // Existing rows are matched on the whole range, not on block_date, because the rows written by
    // the block indexer may carry the wrong date, which is exactly what this repairs
    const [existingAdds, existingRemovals, existingExchanges] = await Promise.all([
      prisma.add_liquidity_events.findMany(),
      prisma.remove_liquidity.findMany(),
      prisma.token_exchange.findMany(),
    ])

    const existingAddKeys = new Set(existingAdds.map(addLiquidityKey))
    const existingRemovalByKey = new Map(existingRemovals.map((r) => [removeLiquidityKey(r), r]))
    const existingExchangeByKey = new Map(existingExchanges.map((e) => [tokenExchangeKey(e), e]))

    const removalsToInsert: Prisma.remove_liquidityCreateManyInput[] = []
    const removalsToRedate: { id: bigint; block_date: Date }[] = []

    removeLiquidityEvents.forEach((event) => {
      const existing = existingRemovalByKey.get(removeLiquidityKey(event))
      if (!existing) {
        removalsToInsert.push(event)
        return
      }
      const blockDateValue = event.block_date as Date
      if (existing.block_date.getTime() !== blockDateValue.getTime()) {
        removalsToRedate.push({ id: existing.id, block_date: blockDateValue })
      }
    })

    // Already indexed rows are left untouched: re-inserting one would double count the deposit in
    // the predeposit accounting. The seen set also guards against a duplicate inside this batch.
    const seenAddKeys = new Set<string>()
    const addsToInsert = addLiquidityEvents.filter((event) => {
      const key = addLiquidityKey(event)
      if (existingAddKeys.has(key) || seenAddKeys.has(key)) return false
      seenAddKeys.add(key)
      return true
    })

    const exchangesToInsert = tokenExchangeEvents.filter((event) => !existingExchangeByKey.has(tokenExchangeKey(event)))

    const summary =
      `${addsToInsert.length} add_liquidity_events (${addLiquidityEvents.length - addsToInsert.length} already indexed), ` +
      `${removalsToInsert.length} remove_liquidity, ${exchangesToInsert.length} token_exchange, ` +
      `${removalsToRedate.length} remove_liquidity dates to repair`

    if (DRY_RUN) {
      console.log(`DRY_RUN, nothing written. Would insert ${summary}`)
      return
    }

    if (addsToInsert.length > 0) {
      await liquidityRepository.insertAddLiquidity(addsToInsert)
    }
    if (removalsToInsert.length > 0) {
      await liquidityRepository.insertRemoveLiquidity(removalsToInsert)
    }
    if (exchangesToInsert.length > 0) {
      await liquidityRepository.insertTokenExchange(exchangesToInsert)
    }
    for (const { id: rowId, block_date } of removalsToRedate) {
      await prisma.remove_liquidity.update({ where: { id: rowId }, data: { block_date } })
    }

    console.log(`Inserted ${summary}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
