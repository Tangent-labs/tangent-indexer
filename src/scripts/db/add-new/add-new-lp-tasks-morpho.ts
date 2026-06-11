import { Prisma, PrismaClient } from "@prisma/client"
import { JsonRpcProvider } from "ethers"
import { PTS_PER_DAY_TO_SECONDS_RATE } from "../config/config_lp_tasks.js"
import { morphoMarketSyntheticTokenAddress } from "../../../eventFectcher/morphoCollateralEventFetcher.js"
import { MORPHO_MARKETS } from "@tangent/defi-resources"

const prisma = new PrismaClient()

async function main() {
  const provider = new JsonRpcProvider(process.env.CHAIN_RPCS!.split(",")[0])

  await addMorphoCollateralLPTask(provider, "sUSG-frxUSD", 5)
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
 *   the following ones are picked up by the block indexer.
 * - lp_user_tasks are replayed here for events up to the last LP points block, the following ones
 *   are picked up by the LP points indexer. Points only accrue from the next computed window:
 *   the backfill makes balances exact but does not award points retroactively.
 *
 * The price source of the collateral token is reused as-is (collateral is denominated in assets,
 * not shares, so 1 unit of position = 1 unit of collateral token).
 */
async function addMorphoCollateralLPTask(provider: JsonRpcProvider, marketKey: string, ptsPerDay: keyof typeof PTS_PER_DAY_TO_SECONDS_RATE) {
  const market = MORPHO_MARKETS["sUSG-frxUSD"]

  if (!market) {
    throw new Error(`No Morpho market "${marketKey}" found in defi-resources`)
  }

  const syntheticToken = morphoMarketSyntheticTokenAddress(market.id)

  // The task starts at the market creation
  const creationBlock = await provider.getBlock(market.creationBlock)
  if (!creationBlock) {
    throw new Error(`Creation block ${market.creationBlock} not found`)
  }
  const startDate = new Date(creationBlock.timestamp * 1000)

  const toExclude = new Set((await prisma.lp_points_users_excluded.findMany()).map((u) => u.user.toLowerCase()))
  toExclude.add(MORPHO_MARKETS?.singleton.toLowerCase())

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

      await tx.lp_task.create({
        data: {
          name: marketKey,
          action_type: "Collateral",
          protocol: "Morpho",
          token_address: syntheticToken,
          point_rate: PTS_PER_DAY_TO_SECONDS_RATE[ptsPerDay],
          description: "Supply sUSG as collateral on Morpho",
          url: `https://app.morpho.org/ethereum/market/${market.id}`,
          price_source_id: priceSource.id,
          start_date: startDate,
          can_zap: false,
        },
      })
    },
    { timeout: 600_000 }
  )
  console.log(`Morpho LP task created for ${marketKey} (synthetic token ${syntheticToken})`)
}
