import { PriceSourceType, Prisma, PrismaClient } from "@prisma/client"
import { JsonRpcProvider } from "ethers"
import { PTS_PER_DAY_TO_SECONDS_RATE } from "../config/config_lp_tasks.js"
import { TRANSFER_TOPICS } from "../../../eventFectcher/erc20TransferEventFetcher.js"
import { fetchAllTransferLogs, fetchContractCreationBlock } from "../../../eventFectcher/etherscanTransferFetcher.js"
import { computeBalancesFromTransfers, seedInitialLpUserTasks } from "./utils/seedInitialBalances.js"

const prisma = new PrismaClient()

// OUSD_USG is not in @tangent/defi-resources CURVE_CONTEXT yet.
// TODO: fill every address before running.
const KEY = "OUSD_USG"
const CTX = {
  curveLp: "",
  curveGauge: "",
  stakeDaoVault: "",
  convexRewardToken: "",
}
// Pool-specific contracts that hold the LP / gauge token on behalf of users (e.g. the StakeDAO sidecar).
// The Curve gauge is added automatically; Convex and StakeDAO lockers are already globally excluded.
const EXTRA_EXCLUSIONS: string[] = []
const PRICE_TYPE: PriceSourceType = "curveApi"
const PRICE_REF = "factory-stable-ng"

/**
 * @notice Adds the Curve LP, Curve gauge, StakeDAO and Convex tasks for a Curve pool, and seeds an
 * lp_user_tasks segment for every address already holding each task token, so existing positions
 * don't start from a zero balance.
 *
 * Balances are recomputed from each token's full history up to the current lp_points_block, which is
 * exactly where the LP points indexer resumes. Convex reward pools emit no Transfer, their balances
 * come from Staked/Withdrawn, as in the live indexer.
 *
 * Requires ETHERSCAN_API_KEY.
 */
async function main() {
  for (const [name, address] of Object.entries(CTX)) if (!address) throw new Error(`CTX.${name} is not set`)

  const provider = new JsonRpcProvider(process.env.CHAIN_RPCS!.split(",")[0])

  const lastPointsBlock = await prisma.lp_points_block.findFirst({ orderBy: { block_id: "desc" } })
  if (!lastPointsBlock) throw new Error("No lp_points_block found — run the LP points indexer at least once first")

  const snapshotBlock = Number(lastPointsBlock.block_id)
  const snapshotBlockData = await provider.getBlock(snapshotBlock)
  if (!snapshotBlockData) throw new Error(`Block ${snapshotBlock} is unknown to CHAIN_RPCS. Is the RPC pointed at the right chain?`)
  const snapshotDate = new Date(snapshotBlockData.timestamp * 1000)
  console.log(`snapshot block ${snapshotBlock} (${snapshotDate.toISOString()})`)

  const lpTasks = buildLpTasks(snapshotDate)

  // Fetch balances outside the transaction: a full-history Etherscan scan takes minutes.
  const balancesByToken = new Map<string, Map<string, bigint>>()
  for (const task of lpTasks) {
    const token = task.token_address
    const creationBlock = await fetchContractCreationBlock(1, token)
    if (creationBlock > snapshotBlock) throw new Error(`${task.description}: ${token} created at ${creationBlock}, after snapshot ${snapshotBlock}`)

    const topics = token === CTX.convexRewardToken.toLowerCase() ? [TRANSFER_TOPICS.Staked, TRANSFER_TOPICS.Withdrawn] : [TRANSFER_TOPICS.Transfer]
    console.log(`${task.description}: scanning ${token} ${creationBlock} -> ${snapshotBlock}`)
    const logs = await fetchAllTransferLogs(1, token, creationBlock, snapshotBlock, topics)
    const balances = computeBalancesFromTransfers(logs)

    // Last chance to spot a wrong holder set (an unexcluded vault at ~100%) before it becomes rows.
    const holders = [...balances.entries()].filter(([, amount]) => amount > 0n)
    console.log(`  ${logs.length} log(s) -> ${holders.length} holder(s)`)
    for (const [address, amount] of holders) console.log(`    ${address}  ${amount.toString()}`)

    balancesByToken.set(token, balances)
  }

  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const [priceSource] = await tx.price_source.createManyAndReturn({
        data: [{ name: KEY, type: PRICE_TYPE, reference: PRICE_REF, address: CTX.curveLp.toLowerCase() }],
      })

      await tx.tracked_erc20.createMany({
        data: lpTasks.map((t) => ({ address: t.token_address, name: `${t.name} ${t.protocol}`, symbol: `${t.name} ${t.protocol}` })),
      })

      const tasks = await tx.lp_task.createManyAndReturn({
        data: lpTasks.map((t) => ({ ...t, price_source_id: priceSource.id })),
      })

      await tx.lp_points_users_excluded.createMany({
        data: [CTX.curveGauge, ...EXTRA_EXCLUSIONS].map((u) => ({ user: u.toLowerCase() })),
        skipDuplicates: true,
      })
      const excludedUsers = new Set((await tx.lp_points_users_excluded.findMany()).map((u) => u.user.toLowerCase()))

      for (const task of tasks) {
        const balances = balancesByToken.get(task.token_address)!
        const expected = [...balances.entries()].filter(([address, amount]) => amount > 0n && !excludedUsers.has(address)).length
        const seeded = await seedInitialLpUserTasks(tx, task.id, balances, snapshotDate, excludedUsers)
        console.log(`seeded ${seeded} segment(s) for task ${task.id} (${task.description})`)
        if (seeded !== expected) throw new Error(`Expected ${expected} segment(s) for task ${task.id} but seeded ${seeded} — rolling back`)
      }
    },
    { timeout: 60_000 }
  )
  console.log("COMPLETED !")
}

function buildLpTasks(startDate: Date): Omit<Prisma.lp_taskCreateManyInput, "price_source_id">[] {
  const base = { name: KEY, action_type: "LP" as const, start_date: startDate }
  return [
    {
      ...base,
      protocol: "Curve",
      token_address: CTX.curveLp.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[45],
      description: `Hold Curve ${KEY} LP tokens`,
      url: `https://www.curve.finance/dex/ethereum/pools/${CTX.curveLp}/deposit`,
      can_zap: true,
    },
    {
      ...base,
      protocol: "Curve",
      token_address: CTX.curveGauge.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
      description: `Stake ${KEY} LP on Curve gauge`,
      url: `https://www.curve.finance/dex/ethereum/pools/${CTX.curveLp}/deposit`,
      can_zap: true,
    },
    {
      ...base,
      protocol: "StakeDAO",
      token_address: CTX.stakeDaoVault.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
      description: `Stake ${KEY} LP on Stake DAO gauge`,
      url: "https://www.stakedao.org/yield",
      can_zap: true,
    },
    {
      ...base,
      protocol: "Convex",
      token_address: CTX.convexRewardToken.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
      description: `Stake ${KEY} LP on Convex`,
      url: "https://curve.convexfinance.com/stake",
      can_zap: false,
    },
  ]
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
