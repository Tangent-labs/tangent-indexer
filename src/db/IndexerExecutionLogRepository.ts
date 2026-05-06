import { AbstractRepository } from "./AbstractRepository.js"
import { INDEXER_EXECUTION_STATUS, IndexerExecutionLogEntry, IndexerExecutionName } from "../type/indexerExecution.js"

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
}
