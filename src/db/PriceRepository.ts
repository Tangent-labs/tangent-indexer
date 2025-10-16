import { Prisma } from "@prisma/client"
import { PriceApiInfo, PriceSource } from "../type/data.js"
import { AbstractRepository } from "./AbstractRepository.js"

export class PriceRepository extends AbstractRepository {
  async insertPriceFeed(prices: PriceApiInfo[], _date?: Date) {
    if (prices?.length > 0) {
      const date = _date || new Date()

      await this.prismaClient.price_feeds.createMany({
        data: prices.map((p) => ({
          timestamp: date,
          price_usd: p.price,
          price_source_id: 1,
        })),
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
    console.log(sql)
    await this.prismaClient.$executeRaw(sql)
  }
}
