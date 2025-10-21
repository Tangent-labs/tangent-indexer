import { Prisma } from "@prisma/client"
import { PriceSource } from "../../type/data.js"
import { AbstractRepository } from "../AbstractRepository.js"

export class PriceRepository extends AbstractRepository {
  async insertPriceFeed(data: Prisma.price_feedsCreateManyInput[]) {
    if (data?.length > 0) {
      await this.prismaClient.price_feeds.createMany({
        data,
      })
    }
  }

  async deleteInsertLastPriceFeeds(data: Prisma.last_price_feedsCreateManyInput[]) {
    if (data?.length > 0) {
      const truncateQuery = Prisma.sql`TRUNCATE TABLE points.last_price_feeds`
      await this.prismaClient.$executeRaw(truncateQuery)
      await this.prismaClient.last_price_feeds.createMany({
        data,
      })
    }
  }

  async getPriceSources() {
    return (await this.prismaClient.price_source.findMany()) as PriceSource[]
  }

  async updateCurvePriceSourceRegistry(priceSources: { address: string; type: string }[]) {
    if (!priceSources.length) return

    const rows = priceSources.map(({ address, type }) => Prisma.sql`(${address.toLowerCase()}::text, ${type}::text)`)
    const sql = Prisma.sql`
      UPDATE points.price_source ps
      SET reference = v.type
      FROM (VALUES ${Prisma.join(rows)}) AS v(address, type)
      WHERE ps.address = v.address
        AND ps.type = 'curveApi'
    `
    await this.prismaClient.$executeRaw(sql)
  }
}
