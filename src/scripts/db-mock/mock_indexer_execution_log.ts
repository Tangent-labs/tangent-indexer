import { Prisma, PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"

import { INDEXER_EXECUTION_NAMES, INDEXER_EXECUTION_STATUS, IndexerExecutionName, IndexerExecutionStatus } from "../../type/indexerExecution.js"

dotenv.config()

const prisma = new PrismaClient()
const MINUTE_MS = 60 * 1000

type MockExecutionLog = {
  indexerName: IndexerExecutionName
  status: IndexerExecutionStatus
  finishedMinutesAgo: number
  durationSeconds?: number
  errorMessage?: string | null
}

function dateMinutesAgo(referenceDate: Date, minutes: number) {
  return new Date(referenceDate.getTime() - minutes * MINUTE_MS)
}

function buildExecution(referenceDate: Date, entry: MockExecutionLog) {
  const finishedAt = dateMinutesAgo(referenceDate, entry.finishedMinutesAgo)
  const durationSeconds = entry.durationSeconds ?? 20
  const startedAt = new Date(finishedAt.getTime() - durationSeconds * 1000)

  return {
    indexerName: entry.indexerName,
    status: entry.status,
    startedAt,
    finishedAt,
    errorMessage: entry.errorMessage ?? null,
  }
}

async function insertExecution(tx: Prisma.TransactionClient, entry: ReturnType<typeof buildExecution>) {
  await tx.$executeRaw`
    INSERT INTO "global"."indexer_execution_log" (
      "indexer_name",
      "status",
      "started_at",
      "finished_at",
      "error_message"
    )
    VALUES (
      ${entry.indexerName},
      ${entry.status}::"global"."IndexerExecutionStatus",
      ${entry.startedAt},
      ${entry.finishedAt},
      ${entry.errorMessage}
    )
  `
}

async function main() {
  const now = new Date()
  const mockExecutions: MockExecutionLog[] = [
    {
      indexerName: INDEXER_EXECUTION_NAMES.BLOCK,
      status: INDEXER_EXECUTION_STATUS.SUCCESS,
      finishedMinutesAgo: 20,
    },
    {
      indexerName: INDEXER_EXECUTION_NAMES.GLOBAL_DATA,
      status: INDEXER_EXECUTION_STATUS.SUCCESS,
      finishedMinutesAgo: 20,
    },
    {
      indexerName: INDEXER_EXECUTION_NAMES.LIQUIDATION_CHECK,
      status: INDEXER_EXECUTION_STATUS.SUCCESS,
      finishedMinutesAgo: 18,
    },
    {
      indexerName: INDEXER_EXECUTION_NAMES.LIQUIDATION_CHECK,
      status: INDEXER_EXECUTION_STATUS.FAILED,
      finishedMinutesAgo: 8,
      errorMessage: "mock_indexer_execution_log: liquidation check failure 1",
    },
    {
      indexerName: INDEXER_EXECUTION_NAMES.LIQUIDATION_CHECK,
      status: INDEXER_EXECUTION_STATUS.FAILED,
      finishedMinutesAgo: 6,
      errorMessage: "mock_indexer_execution_log: liquidation check failure 2",
    },
    {
      indexerName: INDEXER_EXECUTION_NAMES.LIQUIDATION_CHECK,
      status: INDEXER_EXECUTION_STATUS.FAILED,
      finishedMinutesAgo: 4,
      errorMessage: "mock_indexer_execution_log: liquidation check failure 3",
    },
    {
      indexerName: INDEXER_EXECUTION_NAMES.LIQUIDATION_PROCESS,
      status: INDEXER_EXECUTION_STATUS.FAILED,
      finishedMinutesAgo: 4,
      errorMessage: "mock_indexer_execution_log: liquidation process failure 1",
    },
    {
      indexerName: INDEXER_EXECUTION_NAMES.LIQUIDATION_PROCESS,
      status: INDEXER_EXECUTION_STATUS.FAILED,
      finishedMinutesAgo: 2,
      errorMessage: "mock_indexer_execution_log: liquidation process failure 2",
    },
    {
      indexerName: INDEXER_EXECUTION_NAMES.ONCHAIN_TX_BOT,
      status: INDEXER_EXECUTION_STATUS.SUCCESS,
      finishedMinutesAgo: 130,
    },
    {
      indexerName: INDEXER_EXECUTION_NAMES.POINTS_LP,
      status: INDEXER_EXECUTION_STATUS.SUCCESS,
      finishedMinutesAgo: 49 * 60,
    },
    {
      indexerName: INDEXER_EXECUTION_NAMES.SNAPSHOT_PRICES,
      status: INDEXER_EXECUTION_STATUS.SUCCESS,
      finishedMinutesAgo: 2,
    },
  ]

  const indexerNames = [...new Set(mockExecutions.map((entry) => entry.indexerName))]

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "global"."indexer_execution_log"
      WHERE "indexer_name" IN (${Prisma.join(indexerNames)})
    `

    for (const execution of mockExecutions.map((entry) => buildExecution(now, entry))) {
      await insertExecution(tx, execution)
    }
  })

  console.log("Indexer execution log mock data inserted.")
  console.table(
    mockExecutions.map((entry) => ({
      indexer: entry.indexerName,
      status: entry.status,
      finishedMinutesAgo: entry.finishedMinutesAgo,
    }))
  )
  console.log("Expected indexer health alerts:")
  console.log("- block_indexer: stale CRITICAL")
  console.log("- global_data_indexer: stale WARNING")
  console.log("- liquidation_check: stale CRITICAL and failure accumulation WARNING")
  console.log("- liquidation_process: never succeeded WARNING and failure accumulation WARNING")
  console.log("- onchain_tx_bot: stale WARNING")
  console.log("- points_lp_indexer: stale CRITICAL")
  console.log("- snapshot_prices: healthy / no alert")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
