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

  /**
   * @notice  Latest USD price and display name per token address, keyed lowercased.
   *          Tokens without a price source or feed are absent from the map.
   */
  async getLastPrices(addresses: string[]): Promise<Map<string, { price: number; name: string }>> {
    const sources = await this.prismaClient.price_source.findMany({
      where: { address: { in: addresses.map((address) => address.toLowerCase()) } },
      include: { last_price_feeds: true },
    })
    const prices = new Map<string, { price: number; name: string }>()
    for (const source of sources) {
      if (source.last_price_feeds && !prices.has(source.address.toLowerCase())) {
        prices.set(source.address.toLowerCase(), { price: Number(source.last_price_feeds.price_usd), name: source.name })
      }
    }
    return prices
  }

  async insertLpHistory(rows: Prisma.usg_lp_historyCreateManyInput[]) {
    if (rows.length > 0) {
      await this.prismaClient.usg_lp_history.createMany({
        data: rows,
      })
    }
  }
}
