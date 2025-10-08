import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository.js"

export class LiquidationBotLogRepository extends AbstractRepository {
  async insertLiquidationLog(data: Prisma.liquidation_bot_logCreateInput) {
    await this.prismaClient.liquidation_bot_log.create({
      data,
    })
  }

  /**
   * Create multiple liquidation bot log entries in a single transaction
   */
  async createMulti(data: Prisma.liquidation_bot_logCreateManyInput[]) {
    if (data.length > 0) {
      return await this.prismaClient.liquidation_bot_log.createMany({
        data,
        skipDuplicates: false,
      })
    }
  }
}
