import { LiquidationBotLog } from "type/prisma"
import { AbstractRepository } from "./AbstractRepository"

export class LiquidationBotLogRepository extends AbstractRepository {
  insertLiquidationLog(data: LiquidationBotLog) {
    this.prismaClient.liquidation_bot_log.create({
      data,
    })
  }
}
