import { AbstractRepository } from "./AbstractRepository"
import { PriceInfo, PriceSource } from "type/data"

export class PriceRepository extends AbstractRepository {
  async insertPriceFeed(prices: PriceInfo[]) {
    if (prices?.length > 0) {
      const date = new Date()
      await this.prismaClient.price_feed.createMany({
        data: prices.map((p) => ({
          token_address: p.address,
          price: p.price,
          date,
        })),
      })
    }
  }

  async getPriceSources() {
    return (await this.prismaClient.price_source.findMany()) as PriceSource[]
  }
}
