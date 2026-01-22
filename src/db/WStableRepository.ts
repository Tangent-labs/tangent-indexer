import { AbstractRepository } from "./AbstractRepository.js"
import { Prisma } from "@prisma/client"

export class WStableRepository extends AbstractRepository {
  async getAllActiveWStables() {
    return await this.prismaClient.wrapped_stable.findMany({
      where: {
        is_active: {
          equals: true,
        },
      },
    })
  }

  async fetchLastExecutionTime() {
    const lastUpdate = await this.prismaClient.wrapped_stable_history.findFirst({
      orderBy: [
        {
          date: "desc",
        },
      ],
    })
    return lastUpdate?.date
  }

  async insertNewWStablesHistory(newRows: Prisma.wrapped_stable_historyCreateManyInput[]) {
    await this.prismaClient.wrapped_stable_history.createMany({
      data: newRows,
    })
  }

  async updateWStablesHistory(rows: Prisma.wrapped_stable_historyCreateManyInput[], previousDate: Date) {
    // Columns to update
    const columns = ["date", "total_supply", "total_value", "wrapped_stable_id"]

    // Build placeholder values
    const values = rows.map((_, i) => `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(", ")})`).join(", ")

    // Flatten params in array
    const params = rows.flatMap((row) => [previousDate, row.total_supply, row.total_value, row.wrapped_stable_id])

    // Bulk update execute
    await this.prismaClient.$executeRawUnsafe(
      `
        UPDATE global."wrapped_stable_history" AS m SET
            total_supply = v.total_supply,
            total_value = v.total_value,
            wrapped_stable_id = v.wrapped_stable_id
            FROM (VALUES
            ${values}
            ) 
        AS v(
            date,
            total_supply,
            total_value,
            wrapped_stable_id
            )
        WHERE m.wrapped_stable_id = v.wrapped_stable_id
        AND m.date = v.date
        `,
      ...params
    )
  }
}
