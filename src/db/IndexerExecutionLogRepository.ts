import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository.js"
import { INDEXER_EXECUTION_STATUS, IndexerExecutionLogEntry, IndexerExecutionName, IndexerExecutionStatus } from "../type/indexerExecution.js"

export type IndexerExecutionSummary = {
  indexerName: IndexerExecutionName
  status: IndexerExecutionStatus
  startedAt: Date
  finishedAt: Date
}

export type IndexerExecutionHealthSummary = {
  latestExecution: IndexerExecutionSummary | null
  latestSuccess: IndexerExecutionSummary | null
  consecutiveFailures: number
}

export class IndexerExecutionLogRepository extends AbstractRepository {
  async insertExecution(entry: IndexerExecutionLogEntry) {
    await this.prismaClient.$executeRaw`
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
        ${entry.errorMessage ?? null}
      )
    `
  }

  async findLatestSuccessFinishedAt(indexerName: IndexerExecutionName): Promise<Date | null> {
    const rows = await this.prismaClient.$queryRaw<{ finished_at: Date }[]>`
      SELECT "finished_at"
      FROM "global"."indexer_execution_log"
      WHERE "indexer_name" = ${indexerName}
        AND "status" = ${INDEXER_EXECUTION_STATUS.SUCCESS}::"global"."IndexerExecutionStatus"
      ORDER BY "finished_at" DESC
      LIMIT 1
    `

    return rows[0]?.finished_at ?? null
  }

  async getLatestHealthSummaryByIndexer(indexerNames: IndexerExecutionName[]): Promise<Partial<Record<IndexerExecutionName, IndexerExecutionHealthSummary>>> {
    if (indexerNames.length === 0) {
      return {}
    }

    const rows = await this.prismaClient.$queryRaw<
      {
        indexer_name: IndexerExecutionName
        latest_status: IndexerExecutionStatus | null
        latest_started_at: Date | null
        latest_finished_at: Date | null
        latest_success_started_at: Date | null
        latest_success_finished_at: Date | null
        consecutive_failures: bigint | number
      }[]
    >`
      -- Rank every execution once so the next CTEs can pick the latest run
      -- and the latest successful run without repeating the base table filter.
      WITH indexed_executions AS (
        SELECT
          "indexer_name",
          "status",
          "started_at",
          "finished_at",
          ROW_NUMBER() OVER (
            PARTITION BY "indexer_name"
            ORDER BY "finished_at" DESC
          ) AS execution_rank,
          CASE
            WHEN "status" = ${INDEXER_EXECUTION_STATUS.SUCCESS}::"global"."IndexerExecutionStatus" THEN
              ROW_NUMBER() OVER (
                PARTITION BY "indexer_name", "status"
                ORDER BY "finished_at" DESC
              )
            ELSE NULL
          END AS success_rank
        FROM "global"."indexer_execution_log"
        WHERE "indexer_name" IN (${Prisma.join(indexerNames)})
      ),
      -- One row per indexer: the most recent execution, regardless of status.
      latest_execution AS (
        SELECT
          "indexer_name",
          "status",
          "started_at",
          "finished_at"
        FROM indexed_executions
        WHERE execution_rank = 1
      ),
      -- One row per indexer when available: the most recent successful execution.
      latest_success AS (
        SELECT
          "indexer_name",
          "started_at",
          "finished_at"
        FROM indexed_executions
        WHERE success_rank = 1
      ),
      -- Count failures after the latest success, but only when the latest
      -- execution is itself failed; otherwise the consecutive failure count is 0.
      failure_counts AS (
        SELECT
          latest_execution."indexer_name",
          CASE
            WHEN latest_execution."status" = ${INDEXER_EXECUTION_STATUS.FAILED}::"global"."IndexerExecutionStatus"
              THEN COUNT(recent_failures.*)::int
            ELSE 0
          END AS consecutive_failures
        FROM latest_execution
        LEFT JOIN latest_success
          ON latest_success."indexer_name" = latest_execution."indexer_name"
        LEFT JOIN "global"."indexer_execution_log" recent_failures
          ON recent_failures."indexer_name" = latest_execution."indexer_name"
          AND recent_failures."status" = ${INDEXER_EXECUTION_STATUS.FAILED}::"global"."IndexerExecutionStatus"
          AND (
            latest_success."finished_at" IS NULL
            OR recent_failures."finished_at" > latest_success."finished_at"
          )
        GROUP BY latest_execution."indexer_name", latest_execution."status"
      )
      SELECT
        latest_execution."indexer_name",
        latest_execution."status" AS latest_status,
        latest_execution."started_at" AS latest_started_at,
        latest_execution."finished_at" AS latest_finished_at,
        latest_success."started_at" AS latest_success_started_at,
        latest_success."finished_at" AS latest_success_finished_at,
        failure_counts.consecutive_failures
      FROM latest_execution
      LEFT JOIN latest_success
        ON latest_success."indexer_name" = latest_execution."indexer_name"
      INNER JOIN failure_counts
        ON failure_counts."indexer_name" = latest_execution."indexer_name"
    `

    const summaries: Partial<Record<IndexerExecutionName, IndexerExecutionHealthSummary>> = {}
    for (const row of rows) {
      if (!row.latest_status || !row.latest_started_at || !row.latest_finished_at) {
        continue
      }

      summaries[row.indexer_name] = {
        latestExecution: {
          indexerName: row.indexer_name,
          status: row.latest_status,
          startedAt: row.latest_started_at,
          finishedAt: row.latest_finished_at,
        },
        latestSuccess:
          row.latest_success_started_at && row.latest_success_finished_at
            ? {
                indexerName: row.indexer_name,
                status: INDEXER_EXECUTION_STATUS.SUCCESS,
                startedAt: row.latest_success_started_at,
                finishedAt: row.latest_success_finished_at,
              }
            : null,
        consecutiveFailures: Number(row.consecutive_failures),
      }
    }

    return summaries
  }
}
