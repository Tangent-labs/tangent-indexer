import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository.js"

export class PointsBotLogRepository extends AbstractRepository {
  /**
   * Insert a new points bot log entry
   */
  async insertPointsBotLog(data: Prisma.points_bot_logCreateInput) {
    return await this.prismaClient.points_bot_log.create({
      data,
    })
  }

  /**
   * Insert multiple points bot log entries in a single transaction
   */
  async insertManyPointsBotLogs(data: Prisma.points_bot_logCreateManyInput[]) {
    if (data.length > 0) {
      return await this.prismaClient.points_bot_log.createMany({
        data,
        skipDuplicates: false,
      })
    }
  }

  /**
   * Get logs within a date range
   */
  async getLogsByDateRange(startDate: Date, endDate: Date) {
    return await this.prismaClient.points_bot_log.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: "desc",
      },
    })
  }
}
