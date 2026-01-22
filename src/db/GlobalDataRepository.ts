import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository.js"

export class GlobalDataRepository extends AbstractRepository {
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

  async insertRows(data: Prisma.market_global_dataUncheckedCreateInput[]) {
    await this.prismaClient.market_global_data.createMany({
      data,
    })
  }

  async wipeAndInsertLatestDataRows(data: Prisma.latest_global_dataUncheckedCreateInput[]) {
    await this.prismaClient.$executeRawUnsafe(`TRUNCATE "global"."latest_global_data";`)

    if (data.length > 0) {
      await this.prismaClient.latest_global_data.createMany({
        data,
      })
    }
  }

  async updateRows(rows: Prisma.market_global_dataUncheckedCreateInput[], previousDate: Date) {
    // Columns to update
    const columns = [
      "market_id",
      "timestamp",
      "apr_projected",
      "apr_current",
      "tvl_usd",
      "tvl_amount",
      "total_debt",
      "bad_debt",
      "oracle_price",
      "ir_apy",
      "reward_cut",
    ]

    // Build placeholder values
    const values = rows.map((_, i) => `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(", ")})`).join(", ")

    // Flatten params in array
    const params = rows.flatMap((row) => [
      row.market_id,
      previousDate,
      row.apr_projected,
      row.apr_current,
      row.tvl_usd,
      row.tvl_amount,
      row.total_debt,
      row.bad_debt,
      row.oracle_price,
      row.ir_apy,
      row.reward_cut,
    ])

    // Bulk update execute
    await this.prismaClient.$executeRawUnsafe(
      `
    UPDATE global."market_global_data" AS m SET
      apr_projected = v.apr_projected,
      apr_current = v.apr_current,
      tvl_usd = v.tvl_usd,
      tvl_amount = v.tvl_amount,
      total_debt = v.total_debt,
      bad_debt = v.bad_debt,
      oracle_price = v.oracle_price,
      ir_apy = v.ir_apy,
      reward_cut = v.reward_cut
    FROM (VALUES
      ${values}
    ) AS v(
      market_id,
      timestamp,
      apr_projected,
      apr_current,
      tvl_usd,
      tvl_amount,
      total_debt,
      bad_debt,
      oracle_price,
      ir_apy,
      reward_cut
    )
    WHERE m.market_id = v.market_id
      AND m.timestamp = v.timestamp
    `,
      ...params
    )
  }

  async insertGlobalIndicatorValue(values: Prisma.global_indicators_valuesCreateManyInput[]) {
    await this.prismaClient.global_indicators_values.createMany({
      data: values,
    })
  }

  async getGlobalIndicatorIds(values: { key: string; args: string }[]): Promise<Map<string, bigint>> {
    const existingIndicators = await this.prismaClient.global_indicators.findMany({
      where: {
        key: {
          in: values.map((v) => v.key),
        },
      },
    })
    const map = new Map<string, bigint>()
    for (const gi of existingIndicators) {
      map.set(gi.key, gi.id)
    }
    return map
  }

  async insertGlobalIndicator(values: { key: string; args: string }[]): Promise<Map<string, bigint>> {
    const newIndicators = []
    for (const v of values) {
      const created = await this.prismaClient.global_indicators.create({ data: v })
      newIndicators.push(created)
    }
    const map = new Map<string, bigint>()
    for (const gi of newIndicators) {
      map.set(gi.key, gi.id)
    }
    return map
  }
}
