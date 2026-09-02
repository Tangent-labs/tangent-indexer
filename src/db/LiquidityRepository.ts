import { AbstractRepository } from "./AbstractRepository.js"
import { Prisma } from "@prisma/client"

export class LiquidityRepository extends AbstractRepository {
  async insertTransfers(events: Prisma.transfer_eventsCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.transfer_events.createMany({
        data: events,
      })
    }
  }

  async insertAddLiquidity(events: Prisma.add_liquidity_eventsCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.add_liquidity_events.createMany({
        data: events,
      })
    }
  }

  async insertRemoveLiquidity(events: Prisma.remove_liquidityCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.remove_liquidity.createMany({
        data: events,
      })
    }
  }

  async insertTokenExchange(events: Prisma.token_exchangeCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.token_exchange.createMany({
        data: events,
      })
    }
  }
}
