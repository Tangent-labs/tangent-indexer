import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository.js"

export class TotalSupplyRepository extends AbstractRepository {
  async fetchLastExecutionTime() {
    const lastUpdate = await this.prismaClient.total_supplies.findFirst({
      orderBy: [
        {
          timestamp: "desc",
        },
      ],
    })

    return lastUpdate?.timestamp
  }

  async insertRows(data: Prisma.total_suppliesCreateManyInput[]) {
    await this.prismaClient.total_supplies.createMany({
      data,
    })
  }

  async updateRows(rows: Prisma.total_suppliesUncheckedCreateInput[], previousDate: Date) {
    // Columns to update
    const columns = ["token_id", "timestamp", "total_supply"]

    // Build placeholder values
    const values = rows.map((_, i) => `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(", ")})`).join(", ")

    // Flatten params in array
    const params = rows.flatMap((row) => [row.token_id, previousDate, row.total_supply])

    await this.prismaClient.$executeRawUnsafe(
      `UPDATE global."total_supplies" AS t SET total_supply = v.total_supply
       FROM (VALUES${values}) AS v(token_id,timestamp,total_supply)
       WHERE t.token_id = v.token_id
       AND t.timestamp = v.timestamp`,
      ...params
    )
  }
}
