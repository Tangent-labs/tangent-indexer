import { PriceApiInfo, PriceSource } from "type/data"
import { AbstractRepository } from "./AbstractRepository"

export class PriceRepository extends AbstractRepository {
  async insertPriceFeed(prices: PriceApiInfo[]) {
    if (prices?.length > 0) {
      const date = new Date()

      await this.prismaClient.price_feeds.createMany({
        data: prices.map((p) => ({
          timestamp: date,
          price_usd: p.price,
          address: p.address,
        })),
      })
    }
  }

  async getPriceSources() {
    return (await this.prismaClient.price_source.findMany()) as PriceSource[]
  }
}
