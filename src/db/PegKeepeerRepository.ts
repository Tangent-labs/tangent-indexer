import { AbstractRepository } from "./AbstractRepository.js"
import { Prisma } from "@prisma/client"

export class PegKeeperRepository extends AbstractRepository {
  async getAllActivePegKeepers() {
    return await this.prismaClient.peg_keeper.findMany({
      where: {
        is_active: {
          equals: true,
        },
      },
    })
  }

  async fetchLastExecutionTime() {
    const lastUpdate = await this.prismaClient.peg_keeper_history.findFirst({
      orderBy: [
        {
          date: "desc",
        },
      ],
    })
    return lastUpdate?.date
  }

  async insertNewPegKeepersHistory(newRows: Prisma.peg_keeper_historyCreateManyInput[]) {
    await this.prismaClient.peg_keeper_history.createMany({
      data: newRows,
    })
  }

  async updatePegKeepersHistory(rows: Prisma.peg_keeper_historyCreateManyInput[], previousDate: Date) {
    // Columns to update
    const columns = ["date", "balance", "total_value", "peg_keeper_id"]

    // Build placeholder values
    const values = rows.map((_, i) => `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(", ")})`).join(", ")

    // Flatten params in array
    const params = rows.flatMap((row) => [previousDate, row.balance, row.total_value, row.peg_keeper_id])

    // Bulk update execute
    await this.prismaClient.$executeRawUnsafe(
      `
    UPDATE global."peg_keeper_history" AS m SET
      balance = v.balance,
      total_value = v.total_value,
      peg_keeper_id = v.peg_keeper_id
    FROM (VALUES
      ${values}
    ) AS v(
      date,
      balance,
      total_value,
      peg_keeper_id
    )
    WHERE m.peg_keeper_id = v.peg_keeper_id
      AND m.date = v.date
    `,
      ...params
    )
  }
}
