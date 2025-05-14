import { LiquidationBotLog } from "type/prisma"
import { AbstractRepository } from "./AbstractRepository"

export class LiquidationBotLogRepository extends AbstractRepository {
  async insertLiquidationLog(data: LiquidationBotLog) {
    await this.prismaClient.liquidation_bot_log.create({
      data,
    })
  }
}
