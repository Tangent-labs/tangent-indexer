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

  async getUsgLps() {
    return await this.prismaClient.usg_lp_keys.findMany({ select: { id: true, lp_name: true, lp_address: true } })
  }

  /**
   * @notice  Last LP price fed by snapshot_prices at or before the date, the LP price source being
   *          keyed on the pool address
   */
  async getLpPriceAt(lpAddress: string, date: Date): Promise<number | undefined> {
    const feed = await this.prismaClient.price_feeds.findFirst({
      where: { price_source: { address: lpAddress.toLowerCase() }, timestamp: { lte: date } },
      orderBy: { timestamp: "desc" },
    })
    return feed ? Number(feed.price_usd) : undefined
  }

  async insertLpHistory(rows: Prisma.usg_lp_historyCreateManyInput[]) {
    if (rows.length > 0) {
      await this.prismaClient.usg_lp_history.createMany({
        data: rows,
      })
    }
  }
}
