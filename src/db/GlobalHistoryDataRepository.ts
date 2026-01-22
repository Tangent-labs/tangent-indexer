import { AbstractRepository } from "./AbstractRepository.js"
import { Prisma } from "@prisma/client"

export class GlobalHistoryDataRepository extends AbstractRepository {
  async fetchLastExecutionTime() {
    const lastUpdate = await this.prismaClient.usg_global_history.findFirst({
      orderBy: [
        {
          date: "desc",
        },
      ],
    })
    return lastUpdate?.date
  }

  async insertNewGlobalHistory(newRows: Prisma.usg_global_historyCreateInput[]) {
    await this.prismaClient.usg_global_history.createMany({
      data: newRows,
    })
  }

  async updateGlobalHistory(rows: Prisma.usg_global_historyCreateInput[], previousDate: Date) {
    // Columns to update
    const columns = ["date", "total_debt", "total_tvl", "tvl_markets", "tvl_susg", "tvl_peg_keepers", "tvl_wstables"]

    // Build placeholder values
    const values = rows.map((_, i) => `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(", ")})`).join(", ")

    // Flatten params in array
    const params = rows.flatMap((row) => [previousDate, row.total_debt, row.total_tvl, row.tvl_markets, row.tvl_susg, row.tvl_peg_keepers, row.tvl_wstables])

    // Bulk update execute
    await this.prismaClient.$executeRawUnsafe(
      `
    UPDATE global."usg_global_history" AS m SET
      total_debt = v.total_debt,
      total_tvl = v.total_tvl,
      tvl_markets = v.tvl_markets,
      tvl_susg = v.tvl_susg,
      tvl_peg_keepers = v.tvl_peg_keepers,
      tvl_wstables = v.tvl_wstables
    FROM (VALUES
      ${values}
    ) AS v(
      date,
      total_debt,
      total_tvl,
      tvl_markets,
      tvl_susg,
      tvl_peg_keepers,
      tvl_wstables
    )
    WHERE m.date = v.date
    `,
      ...params
    )
  }
}
