import { PrismaClient } from "@prisma/client"
import { IndexerExecutionLogRepository } from "../db/IndexerExecutionLogRepository.js"
import { INDEXER_EXECUTION_STATUS, IndexerExecutionName } from "../type/indexerExecution.js"
import { toSafeErrorMessage } from "../utils/errors.js"

export class IndexerExecutionLogService {
  private readonly indexerExecutionLogRepository: IndexerExecutionLogRepository

  constructor(indexerExecutionLogRepository: IndexerExecutionLogRepository) {
    this.indexerExecutionLogRepository = indexerExecutionLogRepository
  }

  static fromClient(prismaClient: PrismaClient) {
    return new IndexerExecutionLogService(new IndexerExecutionLogRepository(prismaClient))
  }

  async run<T>(indexerName: IndexerExecutionName, execute: () => Promise<T>): Promise<T> {
    const startedAt = new Date()

    try {
      const result = await execute()
      await this.tryLogSuccess(indexerName, startedAt)
      return result
    } catch (error) {
      await this.tryLogFailure(indexerName, startedAt, error)
      throw error
    }
  }

  async getLatestSuccessFinishedAt(indexerName: IndexerExecutionName): Promise<Date | null> {
    return this.indexerExecutionLogRepository.findLatestSuccessFinishedAt(indexerName)
  }

  private async tryLogSuccess(indexerName: IndexerExecutionName, startedAt: Date) {
    try {
      await this.indexerExecutionLogRepository.insertExecution({
        indexerName,
        status: INDEXER_EXECUTION_STATUS.SUCCESS,
        startedAt,
        finishedAt: new Date(),
        errorMessage: null,
      })
    } catch (logError) {
      console.error(`Unable to persist execution log for ${indexerName}:`, logError)
    }
  }

  private async tryLogFailure(indexerName: IndexerExecutionName, startedAt: Date, error: unknown) {
    try {
      await this.indexerExecutionLogRepository.insertExecution({
        indexerName,
        status: INDEXER_EXECUTION_STATUS.FAILED,
        startedAt,
        finishedAt: new Date(),
        errorMessage: toSafeErrorMessage(error),
      })
    } catch (logError) {
      console.error(`Unable to persist execution log for ${indexerName}:`, logError)
    }
  }
}
