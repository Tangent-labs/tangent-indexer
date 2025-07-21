import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository"
import { PriceSource } from "type/data"
import pricesSource from "../data/PriceFeed.json"

export class PriceRepository extends AbstractRepository {
  async insertPriceFeed(events: Prisma.price_feedCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.price_feed.createMany({
        data: events,
      })
    }
  }

  async getPriceSources() {
    return pricesSource as PriceSource[]
  }
}
