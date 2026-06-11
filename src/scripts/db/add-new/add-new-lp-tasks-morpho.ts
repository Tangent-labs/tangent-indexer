import { Prisma, PrismaClient } from "@prisma/client"
import { JsonRpcProvider, ZeroAddress } from "ethers"
import { AddressesJson } from "../../../type/data.js"
import { TransactionPrisma } from "../../../type/prisma.js"
import { getAddressesJson } from "../../../utils/jsonReader.js"
import { fetchBlockTimestamps } from "../../../utils/getLastBlock.js"
import { PTS_PER_DAY_TO_SECONDS_RATE } from "../config/config_lp_tasks.js"
import {
  fetchMorphoCollateralLogsChunked,
  morphoMarketSyntheticTokenAddress,
  parseMorphoCollateralLogs,
} from "../../../eventFectcher/morphoCollateralEventFetcher.js"
import { UserPointsLPRepository } from "../../../db/Points/UserPointsLPRepository.js"

// Providers cap JSON-RPC batch sizes, so block timestamps are fetched in slices
const TIMESTAMPS_BATCH_SIZE = 500

const prisma = new PrismaClient()

async function main() {
  const addresses = await getAddressesJson()
  const provider = new JsonRpcProvider(process.env.CHAIN_RPCS!.split(",")[0])

  await addMorphoCollateralLPTask(provider, addresses, "sUSG-frxUSD", 5)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

/**
 * @notice Adds the points task, synthetic tracked token and exclusion for a Morpho collateral position
 * (supply the collateral token on a Morpho Blue market), and backfills the events emitted since the
 * market creation.
 * @dev Morpho Blue is a singleton and collateral positions are not ERC20 balances: the indexer recomposes
 * synthetic transfer_events from SupplyCollateral/WithdrawCollateral/Liquidate (see morphoCollateralEventFetcher).
 * The synthetic token_address is the first 20 bytes of the market id.
 *
 * Run AFTER deploying the indexer version that fetches Morpho logs, with the indexers STOPPED:
 * - events from the market creation up to the last indexed event block are backfilled here,
 *   the following ones are picked up by the block indexer (it only watches the market once the
 *   synthetic token exists in tracked_erc20, i.e. once this script ran).
 * - lp_user_tasks are replayed here for events up to the last LP points block, the following ones
 *   are picked up by the LP points indexer. Points only accrue from the next computed window:
 *   the backfill makes balances exact but does not award points retroactively.
 *
 * The price source of the collateral token is reused as-is (collateral is denominated in assets,
 * not shares, so 1 unit of position = 1 unit of collateral token).
 */
async function addMorphoCollateralLPTask(
  provider: JsonRpcProvider,
  addresses: AddressesJson,
  marketKey: string,
  ptsPerDay: keyof typeof PTS_PER_DAY_TO_SECONDS_RATE
) {
  const morpho = addresses.morpho
  const market = morpho?.markets?.[marketKey]
  if (!morpho || !market) {
    throw new Error(`No Morpho market "${marketKey}" found in addresses.morpho`)
  }

  const syntheticToken = morphoMarketSyntheticTokenAddress(market.id)

  // The task starts at the market creation
  const creationBlock = await provider.getBlock(market.creationBlock)
  if (!creationBlock) {
    throw new Error(`Creation block ${market.creationBlock} not found`)
  }
  const startDate = new Date(creationBlock.timestamp * 1000)

  // Backfill events from the market creation up to the last indexed event block
  const lastEventBlock = await prisma.event_blocks.findFirst({ orderBy: { block_id: "desc" } })
  const lastLPBlock = await prisma.lp_points_block.findFirst({ orderBy: { block_id: "desc" } })

  const backfilledEvents = lastEventBlock
    ? await fetchBackfillEvents(provider, morpho.singleton, market.id, market.creationBlock, Number(lastEventBlock.block_id))
    : []
  console.log(`Backfill: ${backfilledEvents.length} Morpho events between blocks ${market.creationBlock} and ${lastEventBlock?.block_id ?? "-"}`)

  // The singleton stops earning points where the LP points computation stopped, not at wall-clock
  // time: a later close date would let it accrue on the gap during the next computed window
  const singletonExclusionDate = lastLPBlock ? new Date((await provider.getBlock(Number(lastLPBlock.block_id)))!.timestamp * 1000) : startDate

  const toExclude = new Set((await prisma.lp_points_users_excluded.findMany()).map((u) => u.user.toLowerCase()))
  toExclude.add(morpho.singleton.toLowerCase())

  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // Reuse the price source of the collateral token (sUSG)
      const priceSource = await tx.price_source.findFirst({
        where: { address: market.collateralToken.toLowerCase() },
      })
      if (!priceSource) {
        throw new Error(`No price source found for collateral token ${market.collateralToken}`)
      }

      await tx.tracked_erc20.create({
        data: {
          address: syntheticToken,
          name: marketKey + " Morpho",
          symbol: marketKey + " Morpho",
        },
      })

      const lpTask = await tx.lp_task.create({
        data: {
          name: marketKey,
          action_type: "Collateral",
          protocol: "Morpho",
          token_address: syntheticToken,
          point_rate: PTS_PER_DAY_TO_SECONDS_RATE[ptsPerDay],
          description: `Supply sUSG as collateral on Morpho ${marketKey}`,
          url: `https://app.morpho.org/ethereum/market/${market.id}`,
          price_source_id: priceSource.id,
          start_date: startDate,
          can_zap: false,
        },
      })

      // The Morpho singleton custodies the sUSG collateral and must not earn "Hold sUSG" points;
      // the helper also closes its already-open segments (the market predates this task)
      const userPointsLPRepository = new UserPointsLPRepository(prisma)
      userPointsLPRepository.setClient(tx as TransactionPrisma)
      const closedSegments = await userPointsLPRepository.excludeAddressesFromLpPoints([morpho.singleton], singletonExclusionDate)
      if (closedSegments.count) {
        console.log(`Closed ${closedSegments.count} open lp_user_tasks segment(s) of the Morpho singleton at ${singletonExclusionDate.toISOString()}`)
      }

      if (backfilledEvents.length) {
        await tx.transfer_events.createMany({ data: backfilledEvents })

        const participants = new Set<string>()
        backfilledEvents.forEach((event) => {
          participants.add(event.from.toLowerCase())
          participants.add(event.to.toLowerCase())
        })
        participants.delete(ZeroAddress.toLowerCase())
        await tx.user.createMany({
          data: Array.from(participants).map((address) => ({ address })),
          skipDuplicates: true,
        })

        // Replay the user task segments for events already behind the LP points indexer;
        // the more recent ones will be processed by its normal run
        const eventsToReplay = lastLPBlock ? backfilledEvents.filter((event) => event.block_id <= Number(lastLPBlock.block_id)) : []
        const userTasks = replayUserTaskSegments(eventsToReplay, lpTask.id, toExclude)
        if (userTasks.length) {
          await tx.lp_user_tasks.createMany({ data: userTasks })
        }
        console.log(`Replayed ${userTasks.length} lp_user_tasks segments from ${eventsToReplay.length} events (LP pointer: ${lastLPBlock?.block_id ?? "-"})`)
      }
    },
    { timeout: 600_000 }
  )
  console.log(`Morpho LP task created for ${marketKey} (synthetic token ${syntheticToken})`)
}

async function fetchBackfillEvents(
  provider: JsonRpcProvider,
  singleton: string,
  marketId: string,
  fromBlock: number,
  toBlock: number
): Promise<Prisma.transfer_eventsCreateManyInput[]> {
  const logs = await fetchMorphoCollateralLogsChunked(provider, fromBlock, toBlock, singleton, [marketId])
  const { transferEvents } = parseMorphoCollateralLogs(logs)

  const blockIds = [...new Set(transferEvents.map((event) => event.block_id))]
  const blockDates = new Map<number, number>()
  for (let i = 0; i < blockIds.length; i += TIMESTAMPS_BATCH_SIZE) {
    const batch = await fetchBlockTimestamps(blockIds.slice(i, i + TIMESTAMPS_BATCH_SIZE), process.env.CHAIN_RPCS!.split(",")[0])
    batch.forEach((timestamp: number, blockId: number) => blockDates.set(blockId, timestamp))
  }

  return transferEvents.map((event) => {
    const timestamp = blockDates.get(event.block_id)
    if (!timestamp) {
      throw new Error(`No timestamp fetched for block ${event.block_id}`)
    }
    return { ...event, block_date: new Date(timestamp * 1000) }
  })
}

/**
 * Rebuilds the lp_user_tasks segments from the backfilled events, mirroring
 * UserPointsService.updateLPUserTasks (no pre-existing open segment: the task is new).
 * Morpho synthetic events are pure mints or burns, so each event moves exactly one user
 * by a signed delta.
 */
function replayUserTaskSegments(
  events: Prisma.transfer_eventsCreateManyInput[],
  taskId: bigint,
  toExclude: Set<string>
): Prisma.lp_user_tasksUncheckedCreateInput[] {
  const zeroAddress = ZeroAddress.toLowerCase()
  const sorted = [...events].sort((a, b) => a.block_id - b.block_id)
  const segments: Prisma.lp_user_tasksUncheckedCreateInput[] = []
  const openSegments = new Map<string, { start_date: Date; amount: bigint }>()

  for (const event of sorted) {
    const isMint = event.from.toLowerCase() === zeroAddress
    const userAddress = (isMint ? event.to : event.from).toLowerCase()
    if (userAddress === zeroAddress || toExclude.has(userAddress)) continue

    const delta = isMint ? BigInt(event.amount) : -BigInt(event.amount)
    const open = openSegments.get(userAddress)
    const newAmount = (open?.amount ?? 0n) + delta
    if (newAmount < 0n) {
      throw new Error(`Negative balance for ${userAddress} at block ${event.block_id}: check the market creationBlock in addresses.json`)
    }

    if (open) {
      segments.push({
        task_id: taskId,
        user_address: userAddress,
        start_date: open.start_date,
        closed_date: event.block_date as Date,
        amount: open.amount.toString(),
      })
    }
    if (newAmount !== 0n) {
      openSegments.set(userAddress, { start_date: event.block_date as Date, amount: newAmount })
    } else {
      openSegments.delete(userAddress)
    }
  }

  openSegments.forEach((open, userAddress) => {
    segments.push({
      task_id: taskId,
      user_address: userAddress,
      start_date: open.start_date,
      closed_date: null,
      amount: open.amount.toString(),
    })
  })

  return segments
}
