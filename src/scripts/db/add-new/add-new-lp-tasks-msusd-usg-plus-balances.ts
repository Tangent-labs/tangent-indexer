import { JsonRpcProvider } from "ethers"
import { Prisma, PrismaClient } from "@prisma/client"
import { PTS_PER_DAY_TO_SECONDS_RATE } from "../config/config_lp_tasks.js"
import { fetchAllTransferLogs, fetchContractCreationBlock } from "../../../eventFectcher/etherscanTransferFetcher.js"
import { computeBalancesFromTransfers, seedInitialLpUserTasks } from "./utils/seedInitialBalances.js"

const prisma = new PrismaClient()

const msUSD_USG_LP = "0x21c32256b62c06684e62c9c04ec21100a8919d02"

/**
 * @notice Adds the Curve msUSD/USG LP task, and seeds an lp_user_tasks segment for every address
 * already holding the LP so existing holders don't start from a zero balance.
 *
 * Balances are recomputed from the LP's full Transfer history up to the current lp_points_block,
 * which is exactly where the LP points indexer resumes
 *
 * Requires ETHERSCAN_API_KEY.
 */
async function main() {
  const provider = new JsonRpcProvider(process.env.CHAIN_RPCS!.split(",")[0])

  // fabricationg startDate as the last registered lp_points_block
  const lastPointsBlock = await prisma.lp_points_block.findFirst({ orderBy: { block_id: "desc" } })
  if (!lastPointsBlock) throw new Error("No lp_points_block found — run the LP points indexer at least once first")

  const snapshotBlock = Number(lastPointsBlock.block_id)
  console.log(`[1/6] snapshot block (lp_points_block) : ${snapshotBlock}`)

  const snapshotBlockData = await provider.getBlock(snapshotBlock)
  if (!snapshotBlockData) {
    const head = await provider.getBlockNumber()
    throw new Error(`Block ${snapshotBlock} is unknown to CHAIN_RPCS (head is ${head}). Is the RPC pointed at the right chain?`)
  }
  const snapshotDate = new Date(snapshotBlockData.timestamp * 1000)
  console.log(`      snapshot date                    : ${snapshotDate.toISOString()}`)

  const creationBlock = await fetchContractCreationBlock(1, msUSD_USG_LP)
  console.log(`[2/6] pool creation block (mainnet)    : ${creationBlock}`)

  // The pointer comes from CHAIN_RPCS, the logs come from Etherscan mainnet. On a fork whose head
  // predates the pool, the two disagree and there is nothing sensible to snapshot.
  if (creationBlock > snapshotBlock) {
    throw new Error(
      `Pool ${msUSD_USG_LP} was created at block ${creationBlock}, after the snapshot block ${snapshotBlock}. ` +
        `The chain behind CHAIN_RPCS has not reached the pool yet — nothing to seed.`
    )
  }

  console.log(`[3/6] scanning transfers ${creationBlock} -> ${snapshotBlock} (${snapshotBlock - creationBlock} blocks)`)
  const logs = await fetchAllTransferLogs(1, msUSD_USG_LP, creationBlock, snapshotBlock)

  const balances = computeBalancesFromTransfers(logs)

  const holders = [...balances.entries()].filter(([, amount]) => amount > 0n)

  console.log(`[4/6] ${logs.length} transfer(s) -> ${balances.size} address(es) touched, ${holders.length} holding`)

  // Print what is about to be written: this is the last chance to spot a wrong holder set
  // (an unexcluded gauge, a treasury at ~100%) before it becomes rows.
  for (const [address, amount] of holders) {
    console.log(`        ${address}  ${amount.toString()}`)
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const [priceSource] = await tx.price_source.createManyAndReturn({
      data: [
        {
          name: "msUSD_USG",
          type: "curveApi",
          reference: "factory-stable-ng",
          address: msUSD_USG_LP.toLowerCase(),
        },
      ],
    })

    const lpTask: Prisma.lp_taskCreateManyInput = {
      name: "msUSD-USG",
      action_type: "LP",
      protocol: "Curve",
      token_address: msUSD_USG_LP.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[125],
      description: "Hold Curve msUSD/USG LP tokens",
      url: `https://www.curve.finance/dex/ethereum/pools/${msUSD_USG_LP}/deposit`,
      price_source_id: priceSource.id!,
      start_date: snapshotDate,
      can_zap: true,
    }

    await tx.tracked_erc20.createMany({
      data: [
        {
          address: lpTask.token_address,
          name: `${lpTask.name} ${lpTask.protocol}`,
          symbol: `${lpTask.name} ${lpTask.protocol}`,
        },
      ],
    })

    const [task] = await tx.lp_task.createManyAndReturn({
      data: [lpTask],
    })
    console.log(`[5/6] created price_source ${priceSource.id} and lp_task ${task.id}`)

    const excludedUsers = new Set((await tx.lp_points_users_excluded.findMany()).map((u) => u.user.toLowerCase()))
    const skipped = holders.filter(([address]) => excludedUsers.has(address))
    console.log(`      Skipped ${skipped.length} addresses among the holders : `)

    for (const [address, amount] of skipped) {
      console.log(`        skipping ${address} (${amount.toString()})`)
    }

    const seeded = await seedInitialLpUserTasks(tx, task.id, balances, snapshotDate, excludedUsers)
    console.log(`[6/6] seeded ${seeded} lp_user_tasks segment(s) for task ${task.id}`)

    if (seeded !== holders.length - skipped.length) {
      throw new Error(`Expected to seed ${holders.length - skipped.length} segment(s) but seeded ${seeded} — rolling back`)
    }
  })
  console.log("COMPLETED !")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
