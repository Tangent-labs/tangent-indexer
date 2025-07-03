import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository"

export class MarketGlobalDataRepository extends AbstractRepository {
  async fetchLastExecutionTime() {
    const lastUpdate = await this.prismaClient.market_global_data.findFirst({
      orderBy: [
        {
          timestamp: "desc",
        },
      ],
    })

    return lastUpdate?.timestamp
  }

  async insertRows(rows: Prisma.market_global_dataUncheckedCreateInput[]) {
    await this.prismaClient.market_global_data.createMany({
      data: rows.map((row) => row),
    })
  }

  async updateRows(rows: Prisma.market_global_dataUncheckedCreateInput[], previousDate: Date) {
    await Promise.all(
      rows.map((row) =>
        this.prismaClient.market_global_data.updateMany({
          where: {
            timestamp: previousDate,
            market_id: row.market_id,
          },
          data: { ...row, timestamp: previousDate },
        })
      )
    )
  }
}
