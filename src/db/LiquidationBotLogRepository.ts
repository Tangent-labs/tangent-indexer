import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository"

export class LiquidationBotLogRepository extends AbstractRepository {
  async insertLiquidationLog(data: Prisma.liquidation_bot_logCreateInput) {
    await this.prismaClient.liquidation_bot_log.create({
      data,
    })
  }
}
