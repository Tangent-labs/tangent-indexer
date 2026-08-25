// Backfills CheckpointIR (from irCalculator) and RewardNotified (from rewardAccumulator) events since
// April 1st 2026 by querying Etherscan directly, then stores them in checkpoint_ir / reward_notified.
import * as dotenv from "dotenv"
import { id, Log } from "ethers"
import { PrismaClient } from "@prisma/client"

import { MarketContractsRepository } from "../../../db/MarketContractsRepository.js"
import { RevenuesRepository } from "../../../db/RevenuesRepository.js"
import { TRANSFER_TOPICS } from "../../../eventFectcher/erc20TransferEventFetcher.js"
import { parseCheckpointIR, parseRewardNotified } from "../../../eventFectcher/revenuesEvents.parser.js"
import { fetchAllLogs, getBlockByTimestamp } from "../../../utils/etherscan.js"
import { getAddressesJson } from "../../../utils/jsonReader.js"

dotenv.config()

// The ABI declares `market` as the only indexed field, all other params are packed in log.data
const CHECKPOINT_IR_TOPIC = id("CheckpointIR(address,uint256,uint256)")

const FROM_DATE = new Date("2026-04-01T00:00:00Z")

async function main() {
  const prisma = new PrismaClient()
  const marketContractsRepository = new MarketContractsRepository(prisma)
  const revenuesRepository = new RevenuesRepository(prisma)

  try {
    const addresses = await getAddressesJson()

    const markets = await marketContractsRepository.getContracts()
    const mapMarketIdAddresses = new Map<string, number>(markets.map((m) => [m.contract_address.toLowerCase(), Number(m.id)]))

    const tokens = await revenuesRepository.getRevenuesTokens()
    const mapTokenIdAddresses = new Map<string, bigint>(tokens.map((t) => [t.address.toLowerCase(), t.id]))

    const fromBlock = await getBlockByTimestamp(Math.floor(FROM_DATE.getTime() / 1000), "after")
    console.log(`Backfilling revenues events since ${FROM_DATE.toISOString()} (block ${fromBlock})`)

    const [checkpointLogs, rewardLogs] = await Promise.all([
      fetchAllLogs(addresses.utilities.irCalculator, CHECKPOINT_IR_TOPIC, fromBlock, "latest"),
      fetchAllLogs(addresses.utilities.rewardAccumulator, TRANSFER_TOPICS.RewardNotified, fromBlock, "latest"),
    ])
    console.log(`Fetched ${checkpointLogs.length} CheckpointIR logs and ${rewardLogs.length} RewardNotified logs`)

    const existingCheckpoints = await prisma.checkpoint_ir.findMany({ where: { block_date: { gte: FROM_DATE } } })
    const existingCheckpointKeys = new Set(existingCheckpoints.map((c: { tx_hash: string; market_id: bigint }) => `${c.tx_hash}-${c.market_id}`))

    const existingRewards = await prisma.reward_notified.findMany({ where: { block_date: { gte: FROM_DATE } } })
    const existingRewardKeys = new Set(
      existingRewards.map((r: { tx_hash: string; market_id: bigint; token_id: bigint }) => `${r.tx_hash}-${r.market_id}-${r.token_id}`)
    )

    const checkpointIREvents = checkpointLogs.flatMap((log) => {
      const parsed = parseCheckpointIR(log as unknown as Log, mapMarketIdAddresses)
      if (parsed.market_id === undefined) {
        console.warn(`Skipping CheckpointIR log, unknown market: tx ${log.transactionHash}`)
        return []
      }
      parsed.block_date = new Date(Number(log.timeStamp) * 1000)
      const key = `${parsed.tx_hash}-${parsed.market_id}`
      if (existingCheckpointKeys.has(key)) return []
      return [parsed]
    })

    const rewardNotifiedEvents = rewardLogs.flatMap((log) => {
      const parsed = parseRewardNotified(log as unknown as Log, mapMarketIdAddresses, mapTokenIdAddresses)
      if (parsed.market_id === undefined || parsed.token_id === undefined) {
        console.warn(`Skipping RewardNotified log, unknown market/token: tx ${log.transactionHash}`)
        return []
      }
      parsed.block_date = new Date(Number(log.timeStamp) * 1000)
      const key = `${parsed.tx_hash}-${parsed.market_id}-${parsed.token_id}`
      if (existingRewardKeys.has(key)) return []
      return [parsed]
    })

    if (checkpointIREvents.length > 0) {
      await revenuesRepository.saveCheckpointIRs(checkpointIREvents)
    }
    if (rewardNotifiedEvents.length > 0) {
      await revenuesRepository.saveRewardDistributed(rewardNotifiedEvents)
    }

    console.log(`Saved ${checkpointIREvents.length} CheckpointIR rows and ${rewardNotifiedEvents.length} RewardNotified rows`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
