import { AbstractRepository } from "./AbstractRepository.js"

export class MonitoringRepository extends AbstractRepository {
  async getLatestPegSnapshots() {
    const latest = await this.prismaClient.peg_sanity_snapshots.findFirst({
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    })

    if (!latest) {
      return []
    }

    return this.prismaClient.peg_sanity_snapshots.findMany({
      where: { timestamp: latest.timestamp },
      include: { token: true },
      orderBy: { token_id: "asc" },
    })
  }

  async getLatestOracleSnapshots() {
    const latest = await this.prismaClient.oracle_sanity_snapshots.findFirst({
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    })

    if (!latest) {
      return []
    }

    return this.prismaClient.oracle_sanity_snapshots.findMany({
      where: { timestamp: latest.timestamp },
      include: { market: true },
      orderBy: { market_id: "asc" },
    })
  }

  async getLatestGlobalHistory() {
    return this.prismaClient.usg_global_history.findFirst({
      orderBy: { date: "desc" },
    })
  }

  async getGlobalHistoryAtOrBefore(targetDate: Date) {
    return this.prismaClient.usg_global_history.findFirst({
      where: {
        date: {
          lte: targetDate,
        },
      },
      orderBy: { date: "desc" },
    })
  }

  async getLatestActivePositionRiskSnapshots() {
    return this.prismaClient.$queryRaw<
      {
        market_id: bigint
        borrower_address: string
        cr: number
        distance_pct: number
        liquidation_price: number
        position_value_usd: number
        user_debt: number
        snapshot_timestamp: Date
        contract_name: string
        contract_address: string
        liquidation_threshold: number | null
      }[]
    >`
      WITH latest_position_snapshots AS (
        SELECT DISTINCT ON (ps.market_id, LOWER(ps.borrower_address))
          ps.market_id,
          ps.borrower_address,
          ps.cr,
          ps.distance_pct,
          ps.liquidation_price,
          ps.position_value_usd,
          ps.user_debt,
          ps.snapshot_timestamp
        FROM global.position_snapshots ps
        INNER JOIN global.active_borrowers ab
          ON ab.market_id = ps.market_id
          AND LOWER(ab.borrower_address) = LOWER(ps.borrower_address)
        ORDER BY ps.market_id, LOWER(ps.borrower_address), ps.snapshot_timestamp DESC
      )
      SELECT
        ps.market_id,
        ps.borrower_address,
        ps.cr,
        ps.distance_pct,
        ps.liquidation_price,
        ps.position_value_usd,
        ps.user_debt,
        ps.snapshot_timestamp,
        um.contract_name,
        um.contract_address,
        mc.liquidation_threshold
      FROM latest_position_snapshots ps
      INNER JOIN global.usg_markets um ON um.id = ps.market_id
      LEFT JOIN global.market_config mc ON mc.market_id = ps.market_id
      ORDER BY ps.market_id, ps.borrower_address
    `
  }
}
