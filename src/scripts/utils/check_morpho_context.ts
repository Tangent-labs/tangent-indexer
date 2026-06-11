import { PrismaClient } from "@prisma/client"
import { existsSync, readFileSync } from "fs"
import { JsonRpcProvider, ZeroAddress } from "ethers"
import { getAddressesJson } from "../../utils/jsonReader.js"
import {
  fetchMorphoCollateralLogsChunked,
  morphoMarketSyntheticTokenAddress,
  parseMorphoCollateralLogs,
} from "../../eventFectcher/morphoCollateralEventFetcher.js"

/**
 * @notice Compares the indexed Morpho collateral state (transfer_events, lp_user_tasks, lp_user_points)
 * against the raw fork logs (chain-vs-DB invariant), and — when the ground truth file produced by the
 * tangent-contracts context exists — against its step-by-step expectations as well.
 * Works without the file: ad-hoc sessions driven by morphoActions.ts only need the chain.
 * Usage: tsx src/scripts/utils/check_morpho_context.ts [path/to/morpho-context.json]
 */
const GROUND_TRUTH_PATH = process.argv[2] ?? "../tangent-contracts/morpho-context.json"

const prisma = new PrismaClient()

type ContextEvent = { name: string; args: Record<string, string> }
type ContextStep = { scenario: string; action: string; block: number; tx: string; events: ContextEvent[] }
type MorphoContext = { marketId: string; accounts: Record<string, string>; steps: ContextStep[] }

async function main() {
  const addresses = await getAddressesJson()
  const morpho = addresses.morpho
  if (!morpho) throw new Error("No morpho section in addresses.json")

  const context = existsSync(GROUND_TRUTH_PATH) ? (JSON.parse(readFileSync(GROUND_TRUTH_PATH, "utf-8")) as MorphoContext) : null
  const markets = Object.values(morpho.markets)
  const marketConfig = context ? markets.find((market) => market.id.toLowerCase() === context.marketId.toLowerCase()) : markets[0]
  if (!marketConfig) throw new Error("No matching market in addresses.morpho.markets")
  if (!context) console.log(`No ground truth file at ${GROUND_TRUTH_PATH} — running in chain-only mode`)

  const marketId = marketConfig.id
  const syntheticToken = morphoMarketSyntheticTokenAddress(marketId)
  const addressNames = new Map(Object.entries(context?.accounts ?? {}).map(([name, address]) => [address.toLowerCase(), name]))
  const nameOf = (address: string) => addressNames.get(address.toLowerCase()) ?? address
  let failures = 0

  const check = (label: string, ok: boolean, details = "") => {
    console.log(`${ok ? "✅" : "❌"} ${label}${details ? ` — ${details}` : ""}`)
    if (!ok) failures++
  }

  // Recompose the expected events straight from the chain — same fetch + recomposition code
  // path as the indexer and the backfill: one definition of what a Morpho log becomes
  const provider = new JsonRpcProvider(process.env.CHAIN_RPCS!.split(",")[0])
  const eventPointer = await prisma.event_blocks.findFirst({ orderBy: { block_id: "desc" } })
  if (!eventPointer) throw new Error("No event_blocks pointer — run the block indexer first")
  const logs = await fetchMorphoCollateralLogsChunked(provider, marketConfig.creationBlock, Number(eventPointer.block_id), morpho.singleton, [marketId])
  const { transferEvents: chainEvents } = parseMorphoCollateralLogs(logs)

  // Expected balances: from the chain (always available); the ground truth file adds the
  // independent step-by-step expectations on top
  const expectedBalances = new Map<string, bigint>()
  chainEvents.forEach((event) => {
    if (event.to !== ZeroAddress.toLowerCase()) expectedBalances.set(event.to, (expectedBalances.get(event.to) ?? 0n) + BigInt(event.amount))
    if (event.from !== ZeroAddress.toLowerCase()) expectedBalances.set(event.from, (expectedBalances.get(event.from) ?? 0n) - BigInt(event.amount))
  })

  const dbEvents = await prisma.transfer_events.findMany({
    where: { token_address: syntheticToken },
    orderBy: [{ block_id: "asc" }, { id: "asc" }],
  })

  // 1. Ground truth file (when present): every recorded step must be in transfer_events, one for one
  if (context) {
    const expectedEvents: { block: number; user: string; delta: bigint }[] = []
    for (const step of context.steps) {
      for (const event of step.events) {
        let user: string | undefined
        let delta: bigint | undefined
        if (event.name === "SupplyCollateral") {
          user = event.args.onBehalf.toLowerCase()
          delta = BigInt(event.args.assets)
        } else if (event.name === "WithdrawCollateral") {
          user = event.args.onBehalf.toLowerCase()
          delta = -BigInt(event.args.assets)
        } else if (event.name === "Liquidate") {
          user = event.args.borrower.toLowerCase()
          delta = -BigInt(event.args.seizedAssets)
        }
        if (user && delta !== undefined && delta !== 0n) expectedEvents.push({ block: step.block, user, delta })
      }
    }

    check("ground truth: transfer_events count", dbEvents.length === expectedEvents.length, `db: ${dbEvents.length}, expected: ${expectedEvents.length}`)
    expectedEvents.forEach((expected, i) => {
      const db = dbEvents[i]
      if (!db) return
      const dbUser = (expected.delta > 0n ? db.to : db.from).toLowerCase()
      const dbDelta = expected.delta > 0n ? BigInt(db.amount) : -BigInt(db.amount)
      const ok = db.block_id === expected.block && dbUser === expected.user && dbDelta === expected.delta
      check(`event @${expected.block} ${nameOf(expected.user)} ${expected.delta}`, ok, ok ? "" : `db: @${db.block_id} ${dbUser} ${dbDelta}`)
    })
  }

  // 2. Chain-vs-DB: every recomposed chain event must be in the DB, identical
  check("chain-vs-DB: event count", chainEvents.length === dbEvents.length, `chain: ${chainEvents.length}, db: ${dbEvents.length}`)
  const mismatches = chainEvents.filter((chainEvent, i) => {
    const db = dbEvents[i]
    return !db || db.block_id !== chainEvent.block_id || db.from !== chainEvent.from || db.to !== chainEvent.to || db.amount !== chainEvent.amount
  })
  check("chain-vs-DB: every event identical", mismatches.length === 0, mismatches.length ? `${mismatches.length} mismatching events` : "")

  // 3. lp_user_tasks: one open segment per user with a non-zero balance, none for the others
  const task = await prisma.lp_task.findFirst({ where: { token_address: syntheticToken } })
  if (!task) throw new Error(`No lp_task found for synthetic token ${syntheticToken} — run db:add-morpho-lp-task`)

  const segments = await prisma.lp_user_tasks.findMany({ where: { task_id: task.id }, orderBy: { start_date: "asc" } })
  const openSegmentsByUser = new Map<string, { amount: string; count: number }>()
  segments
    .filter((segment) => segment.closed_date === null)
    .forEach((segment) => {
      const user = segment.user_address.toLowerCase()
      const existing = openSegmentsByUser.get(user)
      openSegmentsByUser.set(user, { amount: segment.amount, count: (existing?.count ?? 0) + 1 })
    })

  const unexpectedOpen = new Map(openSegmentsByUser)
  for (const [user, expected] of expectedBalances) {
    const open = unexpectedOpen.get(user)
    if (expected === 0n) {
      check(`${nameOf(user)} final balance 0 (no open segment)`, !open, open ? `open segment of ${open.amount}` : "")
    } else {
      check(
        `${nameOf(user)} open segment = ${expected}`,
        open?.count === 1 && BigInt(open.amount) === expected,
        open ? `db: ${open.count} open, amount ${open.amount}` : "no open segment"
      )
    }
    unexpectedOpen.delete(user)
  }
  check("no unexpected open segments", unexpectedOpen.size === 0, [...unexpectedOpen.keys()].join(", "))

  const zeroOrExcluded = segments.filter(
    (segment) => segment.user_address.toLowerCase() === ZeroAddress.toLowerCase() || segment.user_address.toLowerCase() === morpho.singleton.toLowerCase()
  )
  check("no segments for zero address or Morpho singleton", zeroOrExcluded.length === 0)

  // 4. Segment continuity: per user, all segments but the last must be closed, in chronological
  // order without overlap (a gap between a close and the next start is a legitimate full exit)
  const byUser = new Map<string, typeof segments>()
  segments.forEach((segment) => {
    const user = segment.user_address.toLowerCase()
    byUser.set(user, [...(byUser.get(user) ?? []), segment])
  })
  let continuityOk = true
  for (const [user, userSegments] of byUser) {
    for (let i = 1; i < userSegments.length; i++) {
      const prev = userSegments[i - 1]
      const curr = userSegments[i]
      if (prev.closed_date === null) {
        continuityOk = false
        console.log(`   ⚠️  ${nameOf(user)}: segment ${i} starts while segment ${i - 1} is still open`)
      } else if (prev.closed_date.getTime() > curr.start_date.getTime()) {
        continuityOk = false
        console.log(`   ⚠️  ${nameOf(user)}: segment ${i} starts before segment ${i - 1} is closed (overlap)`)
      }
    }
  }
  check("segment continuity (closed, ordered, non-overlapping per user)", continuityOk)

  // 5. The singleton must not have a hold-sUSG open segment despite custodying all the collateral
  const sUsgTask = await prisma.lp_task.findFirst({ where: { token_address: addresses.tokens.sUSG.toLowerCase() } })
  if (sUsgTask) {
    const singletonHold = await prisma.lp_user_tasks.findMany({
      where: { task_id: sUsgTask.id, user_address: { equals: morpho.singleton.toLowerCase(), mode: "insensitive" }, closed_date: null },
    })
    check("Morpho singleton excluded from hold-sUSG task", singletonHold.length === 0, `${singletonHold.length} open segments`)
  }

  // 6. Points must accrue for users with an open position
  const points = await prisma.lp_user_points.findMany({ where: { task_id: task.id } })
  for (const [user, expected] of expectedBalances) {
    if (expected <= 0n) continue
    const userPoints = points.find((point) => point.user_address.toLowerCase() === user)
    check(`${nameOf(user)} has points > 0`, (userPoints?.points ?? 0n) > 0n, `points: ${userPoints?.points ?? "none"}`)
  }

  console.log(failures === 0 ? "\n🎉 All checks passed" : `\n💥 ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
